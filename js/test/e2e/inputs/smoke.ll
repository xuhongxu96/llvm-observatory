; An identity add folds to its operand; a constant multiply-add folds to a constant.

define i32 @f(i32 %x) {
  %a = add i32 %x, 0
  ret i32 %a
}

define float @trigger(float %x) {
entry:
  %mul = fmul float %x, 2.000000e+00
  %add = fadd reassoc nsz float %mul, %x
  ret float %add
}

; expect value `i32 %x`: simplifyAddInst, visitAdd, InstructionSimplify.cpp
; expect replace `%a = add i32 %x, 0`: visitAdd, combineInstructionsOverFunction
; expect value `float 3.000000e+00`: visitFAdd, InstCombineAddSub.cpp
; expect mcdc lib/Analysis/InstructionSimplify.cpp: m_Zero
; expect mcdc include/llvm/IR/PatternMatch.h: hasOneUse
; expect visit-mcdc `i32 %x` lib/Analysis/InstructionSimplify.cpp: m_Zero
; expect match lib/Analysis/InstructionSimplify.cpp: m_Zero()  i32 0  ✓
