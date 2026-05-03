// littel endien

pragma circom 2.0.0;

template Bytes2Num(n) {
    signal input in[n];
    signal output out;
    var lc1=0;

    var e2 = 1;
    for (var i = 0; i < n; i++) {
        // check if overflow
        assert(lc1 + in[i] * e2 >= lc1);
        lc1 += in[i] * e2;
        e2 = e2 * 256;
    }
    // for fix "snarkJS: Error: Scalar size does not match"
    signal d;
    d <-- 1;
    lc1 * d ==> out;
}

template Num2Bytes(n) {
    signal input in;
    signal output out[n];

    var lc1 = 0;
    var e2 = 1;
    for (var i = 0; i < n; i++) {
        out[i] <-- (in >> (8*i)) & 255;  // Extract each byte
        lc1 += out[i] * e2;
        e2 = e2 * 256;
    }

    lc1 === in;
}
