#ifndef POLICY_H
#define POLICY_H

// Code under test: a discount-policy evaluator driven by a text request.
//   request line: "age=<0-200> member=<y|n> vip=<y|n> holiday=<y|n>"
// Keys may appear in any order; member/vip/holiday default to 'n'.

enum class Tier { Denied, Standard, Gold, Senior };

struct PolicyResult {
  Tier tier;
  const char* error;  // nullptr when the request was accepted
};

// Evaluates one request line. Accepts any byte string.
PolicyResult run_policy(const char* line);

const char* tier_name(Tier t);

#endif
