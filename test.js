process.env.projectRoot = __dirname;

require('extend-console');

function testo() {
    console.report('hello');
}

testo();

console.report('world');

function generateError() {
    throw new Error('test');
}

try {
    generateError();
} catch (err) {
    console.reportError(err);
}
