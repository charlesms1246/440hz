// ffi-napi is only needed for the Rust backend (?backend=rust).
// Lazy-load so the server starts normally on platforms where native build fails.
let ffi = null;
let rustLib = null;
let isRustBackendInitializing = false;
let isRustBackendInitialized = false;

function loadRustLib() {
    if (rustLib) return;
    try {
        ffi = require('ffi-napi');
    } catch (e) {
        throw new Error('ffi-napi native module not available (Rust backend disabled): ' + e.message);
    }
    rustLib = ffi.Library('./build/librust_prover', {
        'init': ['string', []],
        'generate_calldata': ['string', ['string']],
        'generate_proof': ['string', ['string']],
    });
}


async function callRustFunction(funcName, ...args) {
    console.log(`Calling Rust function: ${funcName}`);
    loadRustLib();

    if (!isRustBackendInitialized) {
        if (!isRustBackendInitializing) {
            isRustBackendInitializing = true;
            await initRustBackend();
            isRustBackendInitializing = false;
            isRustBackendInitialized = true;
        } else {
            console.log("Need some time to wait rustback end ready")
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    try {
        const result = rustLib[funcName](...args);
        const output = result.toString().trim();
        console.log(`Result from ${funcName}:`, output);
        return output;
    } catch (error) {
        console.error(`Error calling ${funcName}:`, error);
        throw error;
    }
}

async function initRustBackend() {
    console.log('Initializing Rust backend...');
    const initResult = await callRustFunction('init');
    console.log('Rust backend initialization result:', initResult);
}

module.exports = {
    callRustFunction
};
