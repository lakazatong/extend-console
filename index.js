'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const { name: packageName } = require('./package.json');
const configPath = './config/config.json';
const configEnvPath = './config/config.env';

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

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))[packageName];
const defaultConfig = require(configPath)[packageName];

let envConfig = {};
let defaultEnvConfig = {};

if (fs.existsSync(configEnvPath)) {
	envConfig = dotenv.parse(fs.readFileSync(configEnvPath, 'utf8'));
}

const defaultEnvPath = path.resolve(__dirname, configEnvPath);
if (fs.existsSync(defaultEnvPath)) {
	defaultEnvConfig = dotenv.parse(fs.readFileSync(defaultEnvPath, 'utf8'));
}

const timezone = ('timezone' in envConfig) ? envConfig.timezone : defaultEnvConfig.timezone;
const locale = ('locale' in envConfig) ? envConfig.locale : defaultEnvConfig.locale;

let formatErrors = ('formatErrors' in config) ? config.formatErrors : defaultConfig.formatErrors;
const colors = ('colors' in config) ? config.colors : defaultConfig.colors;
const logFilenamesFormat = getFilenamesFormatFunction(('logFilenamesFormat' in config) ? config.logFilenamesFormat : defaultConfig.logFilenamesFormat, global.projectRoot);
const logFunctionNameAnonymousObjectAlias = ('logFunctionNameAnonymousObjectAlias' in config) ? config.logFunctionNameAnonymousObjectAlias : defaultConfig.logFunctionNameAnonymousObjectAlias;
const errorFilenamesFormat = getFilenamesFormatFunction(('errorFilenamesFormat' in config) ? config.errorFilenamesFormat : defaultConfig.errorFilenamesFormat, global.projectRoot);
const errorFunctionNameAnonymousObjectAlias = ('errorFunctionNameAnonymousObjectAlias' in config) ? config.errorFunctionNameAnonymousObjectAlias : defaultConfig.errorFunctionNameAnonymousObjectAlias;
const ignoreNodeModulesErrors = ('ignoreNodeModulesErrors' in config) ? config.ignoreNodeModulesErrors : defaultConfig.ignoreNodeModulesErrors;
const logLevel = ('logLevel' in config) ? config.logLevel : defaultConfig.logLevel;

const numberRegex = new RegExp('(\\d+)', '');
const linuxFunctionNameRegex = new RegExp('^at(?: (.+))? ()$', '');
const windowsFunctionNameRegex = new RegExp('^at(?: (.+))? \\(?.{1}$', '');
const functionNameAsRegex = new RegExp('(\\w+(?:\\.\\w+)*)\\.\\w+ \\[as (\\w+)\\]', '');

function parseErrStackLine(line) {
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
			filePath = `${context[3][context[3].length - 1]}:${tmp}`;
			functionName = match[1] ? match[1] : anonymousObjectName;
		}
		return { filePath, functionName, lineNumber, rowNumber };
	} catch (err) {
		return null;
	}
}

function getCallContext(err, startAt) {
	// console.log(err.stack);
	// console.log();
	// here we can just get the first line starting at the 3rd that has information on the functionName
	const lines = err.stack.split('\n');
	for (const line of lines.slice(startAt)) {
		const parsedLine = parseErrStackLine(line);
		// console.log(line, parsedLine);
		// if (parsedLine && parsedLine.functionName && parsedLine.functionName !== anonymousObjectName) return parsedLine;
		if (parsedLine && parsedLine.functionName) return parsedLine;
	}
}

function parseErr(err, considerLine = ignoreNodeModulesErrors ? (parsedLine) => parsedLine.filePath.endsWith('.js') && !parsedLine.filePath.includes('node_modules') : (parsedLine) => Object.values(parsedLine).every(e => e)) {
	const lines = err.stack.split('\n');
	for (const line of lines) {
		// whereas here we take the first .js file in the stack that is not from the node_modules as the call stack is not predictable
		// this kind of assumes no error can arise from a node_module lol, let's say it's less likely than your code breaking when in development
		// at least that's the behavior when ignoreNodeModulesErrors is true
		const parsedLine = parseErrStackLine(line);
		// console.log(line, parsedLine, "\n");
		if (parsedLine && considerLine(parsedLine)) return parsedLine;
	}
	return null;
}

function formatErr(err) {
	let errorNameAndMessage = `(${err.name}) ${err.message.includes('Require stack') ? err.message.split('\n')[0] : err.message}`;
	const parsedErr = parseErr(err);
	
	if (!parsedErr || Object.values(parsedErr).every(e => !e)) return errorNameAndMessage;

	const match = parsedErr.functionName?.match(functionNameAsRegex);
	if (match) {
		parsedErr.functionName = `${match[1]}.${match[2]}`;
	} else if (parsedErr.functionName === anonymousObjectName) {
		parsedErr.functionName = errorFunctionNameAnonymousObjectAlias;
	}

	parsedErr.filePath = errorFilenamesFormat(parsedErr.filePath);

	return `${errorNameAndMessage} (${Object.values(parsedErr).filter(e => e).join(':')})`;
}

function getFormattedTime() {
	const date = Date.now();
	const options = { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' };
	return new Intl.DateTimeFormat(locale, options).format(date);
}

const defaultLogFormat = (logContext, ...args) => {
	const { type, typeColor, filePath, functionName: rawFunctionName, lineNumber } = logContext;
	let functionName = rawFunctionName;
	const match = functionName?.match(functionNameAsRegex);
	if (match) {
		functionName = `${match[1]}.${match[2]}`;
	} else if (functionName === anonymousObjectName) {
		functionName = logFunctionNameAnonymousObjectAlias;
	}
	return `${typeColor}${getFormattedTime()} [${type}]${colors.Reset} ${logFilenamesFormat(filePath)} - Line ${lineNumber} (${colors['FgGreen']}${functionName}${colors['Reset']}):`;
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
const defaultFormatArgsForError = formatErrors
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
			let callContextError;
			let startAt;
			if (args.length >= 1 && args[0] instanceof Error && (type !== 'ERROR' || args.length >= 2)) {
				callContextError = args[0];
				args.shift();
				startAt = 1;
			} else {
				callContextError = new Error();
				startAt = 2;
			}

			let logContext = { logger, type, typeColor };

			const callContext = getCallContext(callContextError, startAt);
			if (callContext) {
				logContext = { ...logContext, ...callContext };
			}

			if (!shouldLog(logContext, ...args)) return;
			logger(logFormat(logContext, ...args), formatArgs(logContext, ...args));
			// return `${callContextError} | ${args}`;
		};
	};
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
		formatErrors: formatErrors,
		colors: colors,
		logFilenamesFormat: logFilenamesFormat,
		logFunctionNameAnonymousObjectAlias: logFunctionNameAnonymousObjectAlias,
		errorFilenamesFormat: errorFilenamesFormat,
		errorFunctionNameAnonymousObjectAlias: errorFunctionNameAnonymousObjectAlias,
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
