'use strict';
const fs = require("fs");
const path = require("path");

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'))["extend-console"];
const colors = config.colors;
const timezone = config.timezone;
const locale = config.locale;

function getFilenamesFormatFunction(condition, projectRoot) {
    return function (filePath) {
        const filename = path.basename(filePath);
        switch (condition) {
            case 'filename':
                return filename;
            case 'relative':
                return projectRoot ? path.relative(projectRoot, filePath) : filePath;
            default:
                return filePath;
        }
    };
}

const logFilenamesFormat = getFilenamesFormatFunction(config.logFilenamesFormat, process.env.projectRoot);
const errorFilenamesFormat = getFilenamesFormatFunction(config.errorFilenamesFormat, process.env.projectRoot);

const numberRegex = new RegExp('(\\d+)', '');
const functionNameRegex = new RegExp('^at ([^ ]+) +', '');
const parseErrStackRegex = new RegExp('at (?:(.+?) )?\\(?([^)]+?.js):(\\d+)(?::(\\d+))?\\)?', '');

function getFormattedTime() {
    const date = Date.now();
    const options = { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' };
    return new Intl.DateTimeFormat(locale, options).format(date);
}

function logFormat(logContext) {
    const { type, typeColor, filename, functionName, lineNumber } = logContext;
    return `${typeColor}${getFormattedTime()} [${type}]${colors.Reset} ${filename} - Line ${lineNumber} (${colors['FgGreen']}${functionName}${colors['Reset']}):`;
}

const defaultFormatArgs = (logContext, ...args) => args.join(' ');
const defaultShouldLog = (logContext, ...args) => true;

function getCallContext(err) {
    // here we can just get the 3rd element of the stack as the call stack is predictable
	const context = err.stack.split('\n')[2].trim().split(':').reverse();
    const rowNumber = numberRegex.exec(context[0])[1];
    const lineNumber = context[1];
    const filename = logFilenamesFormat(context[2]);
    const functionName = functionNameRegex.exec(context[3])[1];
    return { filename, functionName, lineNumber, rowNumber };
}

function logFactory(logger, type, typeColor, formatArgs = defaultFormatArgs, shouldLog = defaultShouldLog) {
    return function (...args) {
        const logContext = { logger, type, typeColor, ...getCallContext(new Error()) };
        if (!shouldLog(logContext, ...args)) return;
        logger(logFormat(logContext), formatArgs(logContext, ...args));
    }
}

function parseErr(err) {
    const lines = err.stack.split('\n');
    for (const line of lines) {
        // whereas here we take the first .js file in the stack that is not from the node_modules as the call stack is not predictable
        const match = parseErrStackRegex.exec(line.trim());
        if (match && !match[2].includes('node_modules')) {
            const functionName = match[1] || '<anonymous>';
            const filename = errorFilenamesFormat(match[2]);
            const lineNumber = match[3];
            const rowNumber = match[4] || undefined;
            return [filename, functionName, lineNumber, rowNumber];
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

console.report = logFactory(console.info, 'INFO', colors.FgCyan);
console.reportWarn = logFactory(console.warn, 'WARN', colors.FgYellow);
console.reportError = logFactory(console.error, 'ERROR', colors.FgRed,
    getFormatArgsForError(
        (process.env.format_errors ? process.env.format_errors.toLowerCase() === "true" : true)
            ? formatErr
            : (err) => err.stack
    )
);

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
    config,
    getFilenamesFormatFunction,
    logFilenamesFormat,
    errorFilenamesFormat,
    numberRegex,
    parseErrStackRegex,
    getFormattedTime,
    logFormat,
    defaultFormatArgs,
    defaultShouldLog,
    getCallContext,
    logFactory,
    parseErr,
    formatErr,
    getFormatArgsForError
};