'use strict';
const fs = require('fs');
const path = require('path');

const configPath = './config/config.json'
if (!fs.existsSync(configPath)) {
	console.error('extend-console: requires a config/config.json at the root of execution, see https://github.com/lakazatong/extend-console/blob/master/config/config.json');
	process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))["extend-console"];
if (!config) {
	console.error('extend-console: the config.json must contain an "extend-console" entry containing its config');
	process.exit(1);
}
const colors = config.colors || (() => {
	console.error('extend-console: requires a colors map in config/config.json with at least Reset, FgCyan, FgYellow and FgRed');
	process.exit(1);
})();
const timezone = config.timezone || 'Europe/Paris';
const locale = config.locale || 'fr-FR';
const logLevel = config.logLevel || config.logLevel === 0 ? config.logLevel : 3;

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

const logFilenamesFormat = getFilenamesFormatFunction(config.logFilenamesFormat, global.projectRoot);
const errorFilenamesFormat = getFilenamesFormatFunction(config.errorFilenamesFormat, global.projectRoot);

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

function getCallContext(err) {
	// here we can just get the 3rd element of the stack as the call stack is predictable
	const context = err.stack.split('\n')[2].trim().split(':').reverse();
	const rowNumber = numberRegex.exec(context[0])[1];
	const lineNumber = context[1];
	const filename = logFilenamesFormat(context[2]);
	const functionName = functionNameRegex.exec(context[3])[1];
	return { filename, functionName: functionName === 'Object.<anonymous>' ? 'module' : functionName, lineNumber, rowNumber };
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

const defaultFormatArgsFunction = (logContext, ...args) => args.join(' ');
const getDefaultShouldLogFunction = (type) => {
	switch (type) {
		case 'INFO':
			return logLevel >= 3 ? () => true : () => false;
		case 'WARN':
			return logLevel >= 2 ? () => true : () => false;
		case 'ERROR':
			return logLevel >= 1 ? () => true : () => false;
		default:
			return () => true;
	}
};
const getDefaultFormatArgsForError = (formatErrFunction) => {
	return function (logContext, ...args) {
		if (!args.length) return '';
		const err = args.pop();
		return `${args.join(' ')}${args.length > 0 ? ' ' : ''}${err instanceof Error ? formatErrFunction(err) : err}`;
	}
}

function logFactory(logger, type, typeColor, defaultFormatArgs = defaultFormatArgsFunction) {
	return function(formatArgs = defaultFormatArgs, shouldLog = getDefaultShouldLogFunction(type)) {
		return function (...args) {
			const logContext = { logger, type, typeColor, ...getCallContext(new Error()) };
			if (!shouldLog(logContext, ...args)) return;
			logger(logFormat(logContext), formatArgs(logContext, ...args));
		}
	}
}

console.createReport = logFactory(console.log, 'INFO', colors.FgCyan);
console.createReportWarn = logFactory(console.warn, 'WARN', colors.FgYellow);
console.createReportError = logFactory(console.error, 'ERROR', colors.FgRed, getDefaultFormatArgsForError(
	(process.env.format_errors ? process.env.format_errors.toLowerCase() === "true" : true)
		? formatErr
		: (err) => err.stack
));

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
	config,
	getFilenamesFormatFunction,
	logFilenamesFormat,
	errorFilenamesFormat,
	numberRegex,
	functionNameRegex,
	parseErrStackRegex,
	getFormattedTime,
	logFormat,
	getCallContext,
	parseErr,
	formatErr,
	defaultFormatArgsFunction,
	getDefaultShouldLogFunction,
	getDefaultFormatArgsForError,
	logFactory,
};