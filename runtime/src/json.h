// A minimal JSON writer for the runtime's events:
//   Json().open().field("type", "value").open("value").field("ptr", P).close().close()
#ifndef LLVM_OBSERVATORY_JSON_H
#define LLVM_OBSERVATORY_JSON_H

#include <cstdio>
#include <string>

namespace llvm_obs {

class Json {
public:
  // Opens an object: the top-level one, or the value of `Key`.
  Json &open(const char *Key = nullptr) {
    prefix(Key);
    Out += '{';
    NeedComma = false;
    return *this;
  }
  Json &close() {
    Out += '}';
    NeedComma = true;
    return *this;
  }
  // Opens an array, the value of `Key`; its elements are objects (open() without a key).
  Json &array(const char *Key) {
    prefix(Key);
    Out += '[';
    NeedComma = false;
    return *this;
  }
  Json &close_array() {
    Out += ']';
    NeedComma = true;
    return *this;
  }
  Json &field(const char *Key, const std::string &Value) {
    prefix(Key);
    quote(Value);
    NeedComma = true;
    return *this;
  }
  // (Without this, a string literal would take the bool overload.)
  Json &field(const char *Key, const char *Value) { return field(Key, std::string(Value)); }
  Json &field(const char *Key, bool Value) {
    prefix(Key);
    Out += Value ? "true" : "false";
    NeedComma = true;
    return *this;
  }
  Json &field(const char *Key, int Value) { return field(Key, static_cast<long>(Value)); }
  Json &field(const char *Key, long Value) {
    prefix(Key);
    Out += std::to_string(Value);
    NeedComma = true;
    return *this;
  }

  const std::string &str() const { return Out; }

private:
  void prefix(const char *Key) {
    if (NeedComma)
      Out += ',';
    if (Key) {
      quote(Key);
      Out += ':';
    }
  }

  void quote(const std::string &S) {
    Out += '"';
    for (unsigned char C : S) {
      if (C == '"' || C == '\\') {
        Out += '\\';
        Out += static_cast<char>(C);
      } else if (C < 0x20) {
        char Escape[8];
        std::snprintf(Escape, sizeof Escape, "\\u%04x", C);
        Out += Escape;
      } else {
        Out += static_cast<char>(C);
      }
    }
    Out += '"';
  }

  std::string Out;
  bool NeedComma = false;
};

} // namespace llvm_obs

#endif
