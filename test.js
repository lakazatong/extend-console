process.env.projectRoot = __dirname;

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
