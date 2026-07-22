// Escapes a value for safe interpolation into a PostgREST `.or()` filter
// expression string (supabase-js does not do this for you — `.or()` takes
// a raw filter-syntax string you build yourself, unlike `.eq()`/`.ilike()`
// which parameterize their single value safely).
//
// PostgREST's `or=(...)` syntax uses commas to separate sub-conditions and
// parentheses for grouping, so an unescaped user-supplied value containing
// those characters can break out of the intended filter and inject an
// arbitrary additional condition. Wrapping the value in double quotes
// tells PostgREST's parser to treat everything inside as one literal
// value; backslashes and embedded double quotes must themselves be
// escaped per PostgREST's quoting rules.
export function escapePostgrestValue(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
