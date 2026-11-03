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

# Returned expressions, except `return nullptr;` and braced initializers.
RETURN_VALUES = query("""
(return_statement (_) @value (#not-eq? @value "nullptr") (#not-match? @value "^[{]"))
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
