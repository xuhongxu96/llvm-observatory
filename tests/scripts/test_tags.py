"""scripts/tags.py on a small source tree."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import tags  # noqa: E402

SOURCE = """\
struct Matcher {
  template <typename T> bool match(T *V) { return V; }
};
template <typename V, typename P> bool match(V *Value, const P &Pattern) { return Pattern.match(Value); }
Value *simplify(Value *A, Value *B, unsigned Depth = 0);
Value *simplify(Value *A, Value *B, unsigned Depth) { return A; }
void log(const char *Format, ...);
"""


def test_tags_name_definitions_declarations_and_arities(tmp_path: Path):
    (tmp_path / "lib").mkdir()
    (tmp_path / "lib/a.cpp").write_text(SOURCE)
    index = tags.index(tmp_path)
    assert index["paths"] == ["lib/a.cpp"]
    t = index["tags"]
    assert t["Matcher"] == [[0, 1, "type", 1, 0, 0]]
    assert t["match"] == [[0, 2, "function", 1, 1, 1], [0, 4, "function", 1, 2, 2]]
    assert t["simplify"] == [[0, 5, "function", 0, 2, 3], [0, 6, "function", 1, 3, 3]]
    assert t["log"] == [[0, 7, "function", 0, 1, -1]]
