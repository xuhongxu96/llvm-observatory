; AggressiveInstCombine recognizes a bit-twiddling population count.
; requires LLVM >= 10

define i32 @popcount32(i32 %x) {
  entry:
    %s1 = lshr i32 %x, 1
    %m1 = and i32 %s1, 1431655765
    %a1 = sub i32 %x, %m1
    %lo2 = and i32 %a1, 858993459
    %s2 = lshr i32 %a1, 2
    %hi2 = and i32 %s2, 858993459
    %a2 = add i32 %lo2, %hi2
    %s4 = lshr i32 %a2, 4
    %a4 = add i32 %s4, %a2
    %m4 = and i32 %a4, 252645135
    %mul = mul i32 %m4, 16843009
    %res = lshr i32 %mul, 24
    ret i32 %res
}

; expect replace `%res = lshr i32 %mul, 24`: tryToRecognizePopCount, foldUnusualPatterns, AggressiveInstCombine.cpp
; expect match lib/Analysis/InstructionSimplify.cpp: i32 1  ✓  Res = 1
