#include "policy.h"

namespace {

struct Request {
  int age;
  bool member;
  bool vip;
  bool holiday;
};

bool is_space(char c) {
  return c == ' ' || c == '\t';
}

bool is_digit(char c) {
  return c >= '0' && c <= '9';
}

// True when the n-character token at p is exactly the key `name`.
bool key_is(const char* p, int n, const char* name) {
  int i = 0;
  while (i < n && name[i] != '\0' && p[i] == name[i]) {
    ++i;
  }
  return i == n && name[i] == '\0';
}

// Accepts exactly "y" or "n". Returns false for anything else.
bool flag_value(const char* v, int n, bool* out) {
  if (n == 1 && v[0] == 'y') {
    *out = true;
    return true;
  }
  if (n == 1 && v[0] == 'n') {
    *out = false;
    return true;
  }
  return false;
}

// Parses an unsigned decimal of 1-3 digits no greater than 200.
bool age_value(const char* v, int n, int* out) {
  if (n == 0 || n > 3) return false;
  int age = 0;
  for (int i = 0; i < n; ++i) {
    if (!is_digit(v[i])) return false;
    age = age * 10 + (v[i] - '0');
  }
  if (age > 200) return false;
  *out = age;
  return true;
}

// Returns false and sets *err (a static string) on malformed input.
bool parse_request(const char* s, Request* out, const char** err) {
  Request r = {0, false, false, false};
  bool seen_age = false;

  while (true) {
    while (is_space(*s)) ++s;
    if (*s == '\0') break;

    const char* key = s;
    while (*s != '=' && *s != '\0' && !is_space(*s)) ++s;
    const int key_len = static_cast<int>(s - key);
    if (*s != '=') {
      *err = "expected key=value";
      return false;
    }
    ++s;

    const char* val = s;
    while (*s != '\0' && !is_space(*s)) ++s;
    const int val_len = static_cast<int>(s - val);

    if (key_is(key, key_len, "age")) {
      if (!age_value(val, val_len, &r.age)) {
        *err = "age must be a number from 0 to 200";
        return false;
      }
      seen_age = true;
    } else if (key_is(key, key_len, "member")) {
      if (!flag_value(val, val_len, &r.member)) {
        *err = "member must be y or n";
        return false;
      }
    } else if (key_is(key, key_len, "vip")) {
      if (!flag_value(val, val_len, &r.vip)) {
        *err = "vip must be y or n";
        return false;
      }
    } else if (key_is(key, key_len, "holiday")) {
      if (!flag_value(val, val_len, &r.holiday)) {
        *err = "holiday must be y or n";
        return false;
      }
    } else {
      *err = "unknown key";
      return false;
    }
  }

  if (!seen_age) {
    *err = "missing age=<n>";
    return false;
  }
  *out = r;
  return true;
}

Tier evaluate(const Request& r) {
  if ((r.age >= 18 && r.age < 65) && (r.member || r.vip)) {
    if (r.vip || (r.holiday && r.member)) {
      return Tier::Gold;
    }
    return Tier::Standard;
  }
  if (r.age >= 65 && r.member) {
    return Tier::Senior;
  }
  return Tier::Denied;
}

}  // namespace

PolicyResult run_policy(const char* line) {
  Request r = {0, false, false, false};
  const char* err = nullptr;
  if (!parse_request(line, &r, &err)) {
    return {Tier::Denied, err};
  }
  return {evaluate(r), nullptr};
}

const char* tier_name(Tier t) {
  switch (t) {
    case Tier::Gold:
      return "GOLD";
    case Tier::Standard:
      return "STANDARD";
    case Tier::Senior:
      return "SENIOR";
    case Tier::Denied:
      break;
  }
  return "DENIED";
}
