# extend-console

## Config

Requires a `config/config.json` at the root of execution, see the one provided

In all following options, the last is the fallback case

### In `config/config.json`: 

3 possible values for `logFilenamesFormat` and `errorFilenamesFormat`:
- `filename`
- `relative` (relative to the `global.projectRoot`, `absolute` if none)
- `absolute`

4 possible values for `logLevel`:
- 0 (None)
- 1 (Errors)
- 2 (Errors + Warnings)
- 3 (Errors + Warnings + Infos)

### In `process.env`:

2 possible values for `format_errors`:
- false (logs err.stack instead)
- true (tries to parse filename, functionName, lineNumber and rowNumber where the error happened)

If the last argument to `console.reportError` is an Error instance and `format_errors` is not provided in `process.env` or is set to `true`, it will try to parse it (behavior of `defaultFormatArgsForError`)

If you absolutely want to report errors where the err is not at the end or you want to report multiple at once, you should provide a formatArgs to `console.createReportError`, for that you might want to check out the `formatErr` and `parseErr` functions provided

## Example usage

See `test.js` and its [associated output](extend-console_example_output.jpg)

A more advanced usage can be found [here](https://github.com/Pupariaa/Cordium/blob/main/internals/Events.js) where it provides custom `logFormat`, `formatArgs` and `shouldLog` functions to `console.createReport`, `console.createReportWarn` and `console.createReportError`

## Advice

require this module after all others with your `global.projectRoot` so that it correctly loads