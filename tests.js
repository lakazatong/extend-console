global.projectRoot = __dirname;

require('./index.js');

function testo() {
	console.report('hello');
}

testo();

console.reportWarn('world');

function generateError() {
	throw new Error('test');
}

try {
	generateError();
} catch (err) {
	console.reportError(err);
}

console.log();
console.report();
console.reportWarn();
console.reportError();

console.log();
const customError = new Error('Custom error message');
console.report(customError);
console.report('Some info message');
console.reportWarn(customError);
console.reportWarn('Some warning message');
console.reportError(customError);
console.reportError('Some error message');

console.log();
console.report(customError, 'Some additional info');
console.report('Some info', 'Additional info');
console.reportWarn(customError, 'Warning message');
console.reportWarn('Some warning', 'Additional warning');
console.reportError(customError, 'Some error context');
console.reportError('Some error', 'Additional context');

console.log();
const customError2 = new Error('Another custom error message');
console.report(customError, customError2);
console.reportWarn(customError, customError2);
console.reportError(customError, customError2);