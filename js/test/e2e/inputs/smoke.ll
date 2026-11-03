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
; expect replace `%a = add i32 %x, 0`: visitAdd, InstCombinerImpl::run
; expect value `float 3.000000e+00`: ConstantFoldBinaryOpOperands, visitFAdd
; expect mcdc lib/Analysis/InstructionSimplify.cpp: m_Zero
