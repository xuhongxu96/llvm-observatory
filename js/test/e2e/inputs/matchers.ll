; What matchers bind: a shuffle mask, and a compare predicate.
; requires LLVM >= 12

define <4 x i32> @shuffles(<4 x i32> %v, <4 x i32> %w) {
  %s1 = shufflevector <4 x i32> %v, <4 x i32> poison, <4 x i32> <i32 1, i32 0, i32 3, i32 2>
  %s2 = shufflevector <4 x i32> %w, <4 x i32> poison, <4 x i32> <i32 1, i32 0, i32 3, i32 2>
  %r = add <4 x i32> %s1, %s2
  ret <4 x i32> %r
}

define i1 @compares(i32 %x, i32 %y) {
  %a = icmp slt i32 %x, 0
  %b = icmp slt i32 %y, 0
  %r = and i1 %a, %b
  ret i1 %r
}

; expect match lib/Transforms/InstCombine/InstructionCombining.cpp: m_Mask(Mask)  ✓  Mask = <1, 0, 3, 2>
; expect match lib/Analysis/InstructionSimplify.cpp: m_ICmp(…)  i1 %a  ✓, Pred = slt
