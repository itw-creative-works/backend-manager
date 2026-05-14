# Code Patterns

## Short-Circuit Returns

Use early returns instead of nested conditionals:

```javascript
// CORRECT
function handler(data) {
  if (!data) {
    return assistant.errorify('Missing data', { code: 400 });
  }

  // Main logic here
  return assistant.respond({ success: true });
}

// INCORRECT
function handler(data) {
  if (data) {
    // Main logic here
    return assistant.respond({ success: true });
  }
}
```

## Logical Operators on New Lines

Place operators at the start of continuation lines:

```javascript
// CORRECT
const isValid = hasPermission
  || isAdmin
  || isOwner;

// INCORRECT
const isValid = hasPermission ||
  isAdmin ||
  isOwner;
```

## Firestore Document Access

Use shorthand `.doc()` path:

```javascript
// CORRECT
admin.firestore().doc('users/abc123')

// INCORRECT
admin.firestore().collection('users').doc('abc123')
```

## Template Strings for Requires

```javascript
// CORRECT
require(`${functionsDir}/node_modules/backend-manager`)

// INCORRECT
require(functionsDir + '/node_modules/backend-manager')
```

## Prefer fs-jetpack

Use `fs-jetpack` over `fs` or `fs-extra` for file operations.
