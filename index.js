'use strict';
const fs = require('fs');
const path = require('path');

const { name: packageName } = require('./package.json');
const configPath = './config/config.json';

let config = JSON.parse(fs.readFileSync(configPath, 'utf8'))[packageName];
if (!config) {
	// load default config
	config = require(configPath)[packageName];
}
const colors = config.colors;
const anonymousObjectName = 'Object.<anonymous>';
function getFilenamesFormatFunction(format, projectRoot) {
	switch (format) {
		case 'filename':
			return (filePath) => path.basename(filePath);
		case 'relative':
			return projectRoot ? (filePath) => path.relative(projectRoot, filePath) : (filePath) => filePath;
		default:
			return (filePath) => filePath;
	}
}
const logFilenamesFormat = getFilenamesFormatFunction(config.logFilenamesFormat, global.projectRoot);
const logFilenamesAnonymousObjectAlias = config.logFilenamesAnonymousObjectAlias || anonymousObjectName;
const errorFilenamesFormat = getFilenamesFormatFunction(config.errorFilenamesFormat, global.projectRoot);
const errorFilenamesAnonymousObjectAlias = config.errorFilenamesAnonymousObjectAlias || anonymousObjectName;
const ignoreNodeModulesErrors = config.ignoreNodeModulesErrors || true;
const timezone = config.timezone || 'Europe/Paris';
const locale = config.locale || 'fr-FR';
const logLevel = config.logLevel || config.logLevel === 0 ? config.logLevel : 3;

const numberRegex = new RegExp('(\\d+)', '');
const functionNameRegex = new RegExp('^at ([^ ]+) +', '');
const parseErrStackRegex = new RegExp('at (?:(.+?) )?\\(?([^)]+?.js):(\\d+)(?::(\\d+))?\\)?', '');

function getCallContext(err) {
	// here we can just get the 3rd element of the stack as the call stack is predictable
	const context = err.stack.split('\n')[2].trim().split(':').reverse();
	const rowNumber = numberRegex.exec(context[0])[1];
	const lineNumber = context[1];
	const filename = context[2];
	const functionName = functionNameRegex.exec(context[3])[1];
	return { filename, functionName, lineNumber, rowNumber };
}

function parseErr(err, considerMatch = ignoreNodeModulesErrors ? (match) => match && !match[2].includes('node_modules') : (match) => match) {
	const lines = err.stack.split('\n');
	for (const line of lines) {
		// whereas here we take the first .js file in the stack that is not from the node_modules as the call stack is not predictable
		// this kind of assumes no error can arise from a node_module lol, let's say it's less likely than your code breaking when in development
		const match = parseErrStackRegex.exec(line.trim());
		if (considerMatch(match)) {
			const functionName = match[1] || errorFilenamesAnonymousObjectAlias;
			const filename = match[2];
			const lineNumber = match[3];
			const rowNumber = match[4] || undefined;
			return { filename, functionName, lineNumber, rowNumber };
		}
	}
	return null;
}

function formatErr(err) {
	let errorNameAndMessage = `(${err.name}) ${err.message.includes('Require stack') ? err.message.split('\n')[0] : err.message}`;
	const parsedErr = parseErr(err);
	if (!parsedErr || Object.values(parsedErr).every(e => !e)) return errorNameAndMessage;
	parsedErr.filename = errorFilenamesFormat(parsedErr.filename);
	return `${errorNameAndMessage} (${Object.values(parsedErr).filter(e => e).join(':')})`;
}

function getFormattedTime() {
	const date = Date.now();
	const options = { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' };
	return new Intl.DateTimeFormat(locale, options).format(date);
}

const defaultLogFormat = (logContext, ...args) => {
	const { type, typeColor, filename, functionName, lineNumber } = logContext;
	return `${typeColor}${getFormattedTime()} [${type}]${colors.Reset} ${logFilenamesFormat(filename)} - Line ${lineNumber} (${colors['FgGreen']}${functionName === anonymousObjectName ? logFilenamesAnonymousObjectAlias : functionName}${colors['Reset']}):`;
};
const defaultFormatArgsForInfo = (logContext, ...args) => args.join(' ');
const defaultFormatArgsForWarn = (logContext, ...args) => args.join(' ');
const getDefaultFormatArgsFunctionForError = function (formatErrorFunction) {
	return function (logContext, ...args) {
		if (!args.length) return '';
		const err = args.pop();
		return `${args.join(' ')}${args.length > 0 ? ' ' : ''}${err instanceof Error ? formatErrorFunction(err) : err}`;
	};
};
const defaultFormatArgsForError = (process.env.format_errors ? process.env.format_errors.toLowerCase() === "true" : true)
	? getDefaultFormatArgsFunctionForError(formatErr)
	: getDefaultFormatArgsFunctionForError((err) => err.stack);
const getDefaultFormatArgsFunction = (type) => {
	switch (type) {
		case 'INFO':
			return defaultFormatArgsForInfo
		case 'WARN':
			return defaultFormatArgsForWarn;
		case 'ERROR':
			return defaultFormatArgsForError;
		default:
			return defaultFormatArgsForInfo;
	}
};
const defaultShouldLog = (logContext, ...args) => true;
const getDefaultShouldLogFunction = (type) => {
	switch (type) {
		case 'INFO':
			return logLevel >= 3 ? defaultShouldLog : (logContext, ...args) => false;
		case 'WARN':
			return logLevel >= 2 ? defaultShouldLog : (logContext, ...args) => false;
		case 'ERROR':
			return logLevel >= 1 ? defaultShouldLog : (logContext, ...args) => false;
		default:
			return defaultShouldLog;
	}
};

function logFactory(logger, type, typeColor) {
	return function(
		logFormat = defaultLogFormat,
		formatArgs = getDefaultFormatArgsFunction(type),
		shouldLog = getDefaultShouldLogFunction(type)
	) {
		return function (...args) {
			const logContext = { logger, type, typeColor, ...getCallContext(new Error()) };
			if (!shouldLog(logContext, ...args)) return;
			logger(logFormat(logContext, ...args), formatArgs(logContext, ...args));
		}
	}
}

console.createReport = logFactory(console.log, 'INFO', colors.FgCyan);
console.createReportWarn = logFactory(console.warn, 'WARN', colors.FgYellow);
console.createReportError = logFactory(console.error, 'ERROR', colors.FgRed);

console.report = console.createReport();
console.reportWarn = console.createReportWarn();
console.reportError = console.createReportError();

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
	config: {
		colors: colors,
		logFilenamesFormat: logFilenamesFormat,
		logFilenamesAnonymousObjectAlias: logFilenamesAnonymousObjectAlias,
		errorFilenamesFormat: errorFilenamesFormat,
		errorFilenamesAnonymousObjectAlias: errorFilenamesAnonymousObjectAlias,
		ignoreNodeModulesErrors: ignoreNodeModulesErrors,
		timezone: timezone,
		locale: locale,
		logLevel: logLevel,
		numberRegex: numberRegex,
		functionNameRegex: functionNameRegex,
		parseErrStackRegex: parseErrStackRegex
	},
	getCallContext,
	parseErr,
	formatErr,
	getFormattedTime,
	defaultLogFormat,
	defaultFormatArgsForInfo,
	defaultFormatArgsForWarn,
	getDefaultFormatArgsFunctionForError,
	defaultFormatArgsForError,
	getDefaultFormatArgsFunction,
	defaultShouldLog,
	getDefaultShouldLogFunction,
	logFactory,
};