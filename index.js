'use strict';
const path = require("path");

const colors = {
    Reset: "\x1b[0m",
    Bright: "\x1b[1m",
    Dim: "\x1b[2m",
    Underscore: "\x1b[4m",
    Blink: "\x1b[5m",
    Reverse: "\x1b[7m",
    Hidden: "\x1b[8m",

    FgBlack: "\x1b[30m",
    FgRed: "\x1b[31m",
    FgGreen: "\x1b[32m",
    FgYellow: "\x1b[33m",
    FgBlue: "\x1b[34m",
    FgMagenta: "\x1b[35m",
    FgCyan: "\x1b[36m",
    FgWhite: "\x1b[37m",

    BgBlack: "\x1b[40m",
    BgRed: "\x1b[41m",
    BgGreen: "\x1b[42m",
    BgYellow: "\x1b[43m",
    BgBlue: "\x1b[44m",
    BgMagenta: "\x1b[45m",
    BgCyan: "\x1b[46m",
    BgWhite: "\x1b[47m"
};

function getFormattedTime() {
    const date = Date.now();
    const options = { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    return new Intl.DateTimeFormat('fr-FR', options).format(date);
}

function logFormat(logContext) {
    const { typeColor, type, filename, line, callContext } = logContext;
    return `${typeColor}${getFormattedTime()} [${type}]${colors.Reset} ${filename} - Line ${line} (${colors['FgGreen']}${callContext}${colors['Reset']}):`;
}

const defaultFormatArgsFunction = (logContext, ...args) => args.join(' ');
const defaultShouldLogFunction = (logContext, ...args) => true;

function logFactory(logger, type, typeColor, defaultFormatArgs = defaultFormatArgsFunction, defaultShouldLog = defaultShouldLogFunction) {
    return function (filename, formatArgs = defaultFormatArgs, shouldLog = defaultShouldLog) {
        return function (line, callContext, ...args) {
            const logContext = { typeColor, type, filename, line, callContext };
            if (!shouldLog(logContext, ...args)) return;
            logger(logFormat(logContext), formatArgs(logContext, ...args));
        }
    };
}

const parseErrStackRegex = new RegExp(' +at (?:(.+?) )?\\(?([^)]+?).js:(\\d+)(?::(\\d+))?\\)?', '');

function parseErr(err) {
    const lines = err.stack.split('\n');
    for (const line of lines) {
        const match = parseErrStackRegex.exec(line);
        if (match && !match[2].includes('node_modules')) {
            const functionName = match[1] || '<anonymous>';
            const filename = path.relative(global.projectRoot, match[2]);
            const lineNumber = match[3];
            const rowNumber = match[4] || undefined;
            return [functionName, filename, lineNumber, rowNumber];
        }
    }
    return null;
}

function formatErr(err) {
    let errorNameAndMessage = `(${err.name}) ${err.message.includes('Require stack') ? err.message.split('\n')[0] : err.message}`;
    const parsedErr = parseErr(err);
    return !parsedErr || parsedErr.every(e => !e) ? errorNameAndMessage : `${errorNameAndMessage} (${parsedErr.filter(e => e).join(':')})`;
}

function getFormatArgsForError(formatErrFunction) {
    return function (logContext, ...args) {
        if (!args.length) return '';
        const err = args.pop();
        return `${args.join(' ')}${args.length > 0 ? ' ' : ''}${err instanceof Error ? formatErrFunction(err) : err}`;
    }
}

console.createReport = logFactory(console.info, 'INFO', colors.FgCyan);
console.createReportWarn = logFactory(console.warn, 'WARN', colors.FgYellow);
console.createReportError = logFactory(console.error, 'ERROR', colors.FgRed,
    getFormatArgsForError(
        (process.env.format_errors ? process.env.format_errors.toLowerCase() === "true" : true)
            ? formatErr
            : (err) => err.stack
    )
);

console.createReports = function (filename) {
    return {
        report: console.createReport(filename),
        reportWarn: console.createReportWarn(filename),
        reportError: console.createReportError(filename)
    };
};

console.fitOnTerm = function (text, mustEndWith = '') {
    const processedLines = text.split('\n').map(line => {
        let result = '';
        let curTrueLength = 0;
        let i = 0;
        const mustEndWithTrueLength = mustEndWith.trueLength();
        while (i < line.length && curTrueLength < process.stdout.columns - mustEndWithTrueLength - 3) {
            result += line[i];
            i++;
            curTrueLength = result.trueLength();
        }
        return i === line.length ? result : `${result}...${mustEndWith}`;
    });
    return processedLines.join('\n');
};

module.exports = {
    colors,
    getFormattedTime,
    logFormat,
    defaultFormatArgsFunction,
    defaultShouldLogFunction,
    logFactory,
    parseErrStackRegex,
    parseErr,
    formatErr,
    getFormatArgsForError
};