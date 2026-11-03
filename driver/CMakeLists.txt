# The observed driver, built inside the target LLVM tree as an external project:
#   -DLLVM_EXTERNAL_PROJECTS=observatory_driver
#   -DLLVM_EXTERNAL_OBSERVATORY_DRIVER_SOURCE_DIR=<this directory>
#
# External projects are configured after llvm/lib, so this file can also set the flags
# of the observed LLVM sources without editing LLVM's own CMake files:
#   - the hooks header is force-included into every patched source;
#   - the observed sources get DWARF (stack traces) and MC/DC coverage. Their flags
#     differ from the rest of LLVM, so they cannot use LLVM's shared precompiled headers.
cmake_minimum_required(VERSION 3.20)

get_filename_component(OBSERVATORY_RUNTIME "${CMAKE_CURRENT_SOURCE_DIR}/../runtime" ABSOLUTE)
set(HOOKS -include "${OBSERVATORY_RUNTIME}/include/llvm_observatory/hooks.h")
# -O0 keeps every call a frame of its own: in optimized code, DWARF attributes merged
# code to the wrong inlined frames.
set(OBSERVE -O0 -g -fprofile-instr-generate -fcoverage-mapping -fcoverage-mcdc)

# Whole libraries under observation.
foreach(lib LLVMInstCombine LLVMAggressiveInstCombine)
  if(TARGET ${lib})
    set_property(TARGET ${lib} APPEND PROPERTY COMPILE_OPTIONS ${HOOKS} ${OBSERVE})
    set_property(TARGET ${lib} PROPERTY DISABLE_PRECOMPILE_HEADERS ON)
  endif()
endforeach()

# Single files of larger libraries. ValueTracking has no hooks, only coverage: its
# conditions often decide whether a fold applies.
function(observe_sources dir)
  cmake_parse_arguments(ARG "" "" "HOOKS;OBSERVE" ${ARGN})
  set(files ${ARG_HOOKS} ${ARG_OBSERVE})
  list(REMOVE_DUPLICATES files)
  foreach(file IN LISTS files)
    set(options)
    if(file IN_LIST ARG_HOOKS)
      list(APPEND options ${HOOKS})
    endif()
    if(file IN_LIST ARG_OBSERVE)
      list(APPEND options ${OBSERVE})
    endif()
    set(source "${LLVM_MAIN_SRC_DIR}/${dir}/${file}")
    set_property(SOURCE "${source}" DIRECTORY "${LLVM_MAIN_SRC_DIR}/${dir}"
      APPEND PROPERTY COMPILE_OPTIONS ${options})
    set_property(SOURCE "${source}" DIRECTORY "${LLVM_MAIN_SRC_DIR}/${dir}"
      PROPERTY SKIP_PRECOMPILE_HEADERS ON)
  endforeach()
endfunction()

observe_sources(lib/Analysis
  HOOKS InstructionSimplify.cpp ConstantFolding.cpp
  OBSERVE InstructionSimplify.cpp ConstantFolding.cpp ValueTracking.cpp)
observe_sources(lib/IR HOOKS Value.cpp)

set(LLVM_LINK_COMPONENTS
  AggressiveInstCombine
  Analysis
  AsmParser
  Core
  InstCombine
  IRReader
  Passes
  Support
  TransformUtils
)

add_llvm_executable(observatory_driver
  driver.cpp
  ${OBSERVATORY_RUNTIME}/src/host.cpp
  ${OBSERVATORY_RUNTIME}/src/runtime.cpp
)
target_include_directories(observatory_driver PRIVATE "${OBSERVATORY_RUNTIME}/include")
set_target_properties(observatory_driver PROPERTIES CXX_STANDARD 17 SUFFIX ".js")

# The observed objects come first in the link, so that the copy wasm-ld keeps of each
# inline function they share with the rest of LLVM is theirs. wasm-ld places the DWARF
# of every discarded copy at the kept copy; when the kept copy is an optimized one from
# elsewhere in LLVM, that DWARF claims the code after it. Observed copies are compiled
# alike, so their DWARF fits the observed copy that is kept.
set(observed_objects $<TARGET_OBJECTS:LLVMInstCombine>)
if(TARGET LLVMAggressiveInstCombine)
  list(APPEND observed_objects $<TARGET_OBJECTS:LLVMAggressiveInstCombine>)
endif()
foreach(name InstructionSimplify ConstantFolding ValueTracking)
  list(APPEND observed_objects "$<FILTER:$<TARGET_OBJECTS:LLVMAnalysis>,INCLUDE,/${name}[.]cpp[.]o$>")
endforeach()
target_link_options(observatory_driver BEFORE PRIVATE ${observed_objects})

# -g keeps the DWARF and the coverage sections in the linked module; -O0 keeps binaryen
# from rewriting the linked code, which leaves DWARF function ranges out of step with it.
# -fprofile-instr-generate links the profile runtime.
target_link_options(observatory_driver PRIVATE
  -g
  -O0
  -fprofile-instr-generate
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sENVIRONMENT=web,worker,node
  -sFORCE_FILESYSTEM=1
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=64MB
  -sSTACK_SIZE=8MB
  -sEXIT_RUNTIME=0
  -sINVOKE_RUN=0
  -sEXPORTED_RUNTIME_METHODS=FS,callMain
)
