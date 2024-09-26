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
			return (filePath) => filePath
				? path.basename(filePath)
				: filePath;
		case 'relative':
			return projectRoot
				? (
					(filePath) => filePath
						? path.relative(projectRoot, filePath)
						: filePath
				)
				: (filePath) => filePath;
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
const linuxFunctionNameRegex = new RegExp('^at(?: (.+))? ()$', '');
const windowsFunctionNameRegex = new RegExp('^at(?: (.+))? \\(?.{1}$', '');

function parseErrStackLine(line) {
	//at C:\Users\Bo_wo\Desktop\code\Cordium\src\commands\clean.js:32:25
	//at CommandHandler.deployCommands (C:\Users\Bo_wo\Desktop\code\Cordium\internals\CommandManager.js:58:21)
	try {
		const context = line.trim().split(':').reverse();
		const rowNumber = numberRegex.exec(context[0])[1];
		const lineNumber = context[1];
		let tmp = context[2];
		let filePath, functionName;
		if (tmp.includes(' ')) {
			// probably Linux
			const match = linuxFunctionNameRegex.exec(tmp);
			functionName = match[1];
			filePath = match[2];
		} else {
			// probably Windows
			// because windows paths start with `${driveLetter}:`
			const match = windowsFunctionNameRegex.exec(context[3]);
			functionName = match[1] || anonymousObjectName;
			filePath = `${context[3][context[3].length - 1]}:${tmp}`;
		}
		return { filePath, functionName, lineNumber, rowNumber };
	} catch (err) {
		return null;
	}
}

function getCallContext(err) {
	// here we can just get the first line starting at the 3rd that has information on the functionName
	const lines = err.stack.split('\n');
	for (const line of lines.slice(2)) {
		const parsedLine = parseErrStackLine(line);
		if (parsedLine && parsedLine.functionName && parsedLine.functionName !== anonymousObjectName) return parsedLine;
	}
}

function parseErr(err, considerLine = ignoreNodeModulesErrors ? (parsedLine) => parsedLine.filePath.endsWith('.js') && !parsedLine.filePath.includes('node_modules') : (parsedLine) => Object.values(parsedLine).every(e => e)) {
	const lines = err.stack.split('\n');
	for (const line of lines) {
		// whereas here we take the first .js file in the stack that is not from the node_modules as the call stack is not predictable
		// this kind of assumes no error can arise from a node_module lol, let's say it's less likely than your code breaking when in development
		// at least that's the behavior when ignoreNodeModulesErrors is true
		const parsedLine = parseErrStackLine(line);
		if (parsedLine && considerLine(parsedLine)) return parsedLine;
	}
	return null;
}

function formatErr(err) {
	let errorNameAndMessage = `(${err.name}) ${err.message.includes('Require stack') ? err.message.split('\n')[0] : err.message}`;
	const parsedErr = parseErr(err);
	if (!parsedErr || Object.values(parsedErr).every(e => !e)) return errorNameAndMessage;
	parsedErr.filePath = errorFilenamesFormat(parsedErr.filePath);
	return `${errorNameAndMessage} (${Object.values(parsedErr).filter(e => e).join(':')})`;
}

function getFormattedTime() {
	const date = Date.now();
	const options = { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' };
	return new Intl.DateTimeFormat(locale, options).format(date);
}

const defaultLogFormat = (logContext, ...args) => {
	const { type, typeColor, filePath, functionName, lineNumber } = logContext;
	return `${typeColor}${getFormattedTime()} [${type}]${colors.Reset} ${logFilenamesFormat(filePath)} - Line ${lineNumber} (${colors['FgGreen']}${functionName === anonymousObjectName ? logFilenamesAnonymousObjectAlias : functionName}${colors['Reset']}):`;
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
	return function (
		logFormat = defaultLogFormat,
		formatArgs = getDefaultFormatArgsFunction(type),
		shouldLog = getDefaultShouldLogFunction(type)
	) {
		return function (...args) {
			let logContext = { logger, type, typeColor };
			const callContext = getCallContext(new Error());
			if (callContext) logContext = { ...logContext, ...callContext };
			if (!shouldLog(logContext, ...args)) return;
			logger(logFormat(logContext, ...args), formatArgs(logContext, ...args));
		}
	}
}

console.createReport ??= logFactory(console.log, 'INFO', colors.FgCyan);
console.createReportWarn ??= logFactory(console.warn, 'WARN', colors.FgYellow);
console.createReportError ??= logFactory(console.error, 'ERROR', colors.FgRed);

console.report ??= console.createReport();
console.reportWarn ??= console.createReportWarn();
console.reportError ??= console.createReportError();

console.fitOnTerm ??= function (text, mustEndWith = '') {
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
	},
	parseErrStackLine,
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