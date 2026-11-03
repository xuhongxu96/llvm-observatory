"""Every tree-sitter query the patcher uses."""

from __future__ import annotations

from .source import query

# Return types worth observing. A coarse filter on the declared type's text: the hook
# itself, llvm_obs::observed(), checks at compile time that the returned expression
# converts to `const llvm::Value *`, so a stray match only costs a no-op wrap.
VALUE_TYPE_HINT = "Instruction|Value|BinaryOperator|CastInst|CmpInst|PHINode|SelectInst|Constant"

# Functions returning a single pointer to a value-like type.
VALUE_FUNCTIONS = query(f"""
(function_definition
  type: (_) @type
  declarator: (pointer_declarator declarator: (function_declarator))
  body: (compound_statement) @body
  (#match? @type "{VALUE_TYPE_HINT}"))
""")

# Returned values, except nullptr, braced lists, and replaceInstUsesWith(I, V) in any form
# (IC.…, IC->…, inside eraseInstFromFunction or a conditional): it returns the old
# instruction I, and the replacement is recorded by the replace hook.
RETURN_VALUES = query("""
(return_statement (_) @value
  (#not-eq? @value "nullptr")
  (#not-match? @value "^[{]")
  (#not-match? @value "replaceInstUsesWith *[(]"))
""")

# Bodies that own their return statements: a return inside one of these, nested in an
# observed function, belongs to the nested scope.
NESTED_SCOPES = query("""
[(lambda_expression) (function_definition)] @scope
""")


def function_entry(names: tuple[str, ...]) -> str:
    """Query source for the definitions of the qualified `names`, capturing the function
    `@name`, its first pointer parameter `@first_param` (if any) and the body's `@open`."""
    quoted = " ".join(f'"{n}"' for n in names)
    return f"""
(function_definition
  declarator: (function_declarator
    declarator: (qualified_identifier) @name
    parameters: (parameter_list
      . (parameter_declaration
          declarator: (pointer_declarator declarator: (identifier) @first_param))?))
  body: (compound_statement "{{" @open)
  (#any-of? @name {quoted}))
"""


def calls_to(callee: str) -> str:
    """Query source for the calls of the function named `callee` with one argument,
    capturing the `@call` and its `@argument`."""
    return f"""
(call_expression
  function: (identifier) @callee
  arguments: (argument_list . (_) @argument .)
  (#eq? @callee "{callee}")) @call
"""


# Calls of PatternMatch's match(V, Pattern): `match(...)` or `PatternMatch::match(...)`
# with two arguments (not the matchers' own `P.match(V)`).
MATCH_CALLS = query("""
(call_expression
  function: [(identifier) @callee
             (qualified_identifier name: (identifier) @callee)]
  arguments: (argument_list . (_) . (_) .)
  (#eq? @callee "match")) @call
""")

# Classes and structs with a body.
CLASS_BODIES = query("""
[(struct_specifier name: (type_identifier) @name body: (field_declaration_list) @body)
 (class_specifier name: (type_identifier) @name body: (field_declaration_list) @body)]
""")

# The members a class declares, references and pointers included.
MEMBERS = query("""
(field_declaration
  declarator: [(field_identifier) @member
               (reference_declarator (field_identifier) @member)
               (pointer_declarator declarator: (field_identifier) @member)
               (pointer_declarator declarator: (reference_declarator (field_identifier) @member))
               (pointer_declarator declarator: (pointer_declarator declarator: (field_identifier) @member))])
""")

# Functions named `match` (a matcher's method when in a class body; tree-sitter names a
# templated method with an identifier, a plain one with a field_identifier).
MATCH_METHODS = query("""
(function_definition
  declarator: (function_declarator
    declarator: [(field_identifier) (identifier)] @name
    parameters: (parameter_list) @params)
  body: (compound_statement "{" @open) @body
  (#eq? @name "match")) @method
""")

# Pointer parameters, by name.
POINTER_PARAMETERS = query("""
(parameter_declaration declarator: (pointer_declarator declarator: (identifier) @parameter))
""")

# Plain assignments to a name or through a pointer name: `X = ...`, `*X = ...`.
ASSIGNMENTS = query("""
(assignment_expression
  left: [(identifier) @target (pointer_expression argument: (identifier) @target)]
  operator: "="
  right: (_) @value)
""")
