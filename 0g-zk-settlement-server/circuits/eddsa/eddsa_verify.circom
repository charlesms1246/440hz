pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/compconstant.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/pointbits.circom";
include "../../node_modules/circomlib/circuits/pedersen.circom";
include "../../node_modules/circomlib/circuits/escalarmulany.circom";
include "../../node_modules/circomlib/circuits/escalarmulfix.circom";

template EdDSAVerify(nBytes) {
    var n = nBytes * 8;
    signal input msg[nBytes];

    signal input A[32];
    signal input R8[32];
    signal input S[32];

    component bitsMsg[nBytes];
    for (var i=0; i<nBytes; i++) {
        bitsMsg[i] = Num2Bits(8);
        bitsMsg[i].in <== msg[i];
    }

    component bitsA[32];
    component bitsR8[32];
    component bitsS[32];
    for (var i=0; i<32; i++) {
        bitsA[i] = Num2Bits(8);
        bitsR8[i] = Num2Bits(8);
        bitsS[i] = Num2Bits(8);

        bitsA[i].in <== A[i];
        bitsR8[i].in <== R8[i];
        bitsS[i].in <== S[i];
    }

    signal Ax;
    signal Ay;

    signal R8x;
    signal R8y;

    var i;

// Ensure S<Subgroup Order

    component  compConstant = CompConstant(2736030358979909402780800718157159386076813972158567259200215660948447373040);

    for (i=0; i<254; i++) {
        var row = i \ 8;
        var col = i % 8;
        // log("row: ", row, "col: ", col);
        bitsS[row].out[col] ==> compConstant.in[i];
    }
    compConstant.out === 0;
    bitsS[31].out[6] === 0;
    bitsS[31].out[7] === 0;

// Convert A to Field elements (And verify A)

    component bits2pointA = Bits2Point_Strict();

    for (i=0; i<256; i++) {
        var row = i \ 8;
        var col = i % 8;
        bits2pointA.in[i] <== bitsA[row].out[col];
    }
    Ax <== bits2pointA.out[0];
    Ay <== bits2pointA.out[1];

// Convert R8 to Field elements (And verify R8)

    component bits2pointR8 = Bits2Point_Strict();

    for (i=0; i<256; i++) {
        var row = i \ 8;
        var col = i % 8;
        bits2pointR8.in[i] <== bitsR8[row].out[col];
    }
    R8x <== bits2pointR8.out[0];
    R8y <== bits2pointR8.out[1];

// Calculate the h = H(R,A, msg)

    component hash = Pedersen(512+n);

    for (i=0; i<256; i++) {
        var row = i \ 8;
        var col = i % 8;
        hash.in[i] <== bitsR8[row].out[col];
        hash.in[256+i] <== bitsA[row].out[col];
    }
    for (i=0; i<n; i++) {
        var row = i \ 8;
        var col = i % 8;
        hash.in[512+i] <== bitsMsg[row].out[col];
    }

    component point2bitsH = Point2Bits_Strict();
    point2bitsH.in[0] <== hash.out[0];
    point2bitsH.in[1] <== hash.out[1];

// Calculate second part of the right side:  right2 = h*8*A

    // Multiply by 8 by adding it 3 times.  This also ensure that the result is in
    // the subgroup.
    component dbl1 = BabyDbl();
    dbl1.x <== Ax;
    dbl1.y <== Ay;
    component dbl2 = BabyDbl();
    dbl2.x <== dbl1.xout;
    dbl2.y <== dbl1.yout;
    component dbl3 = BabyDbl();
    dbl3.x <== dbl2.xout;
    dbl3.y <== dbl2.yout;

    // We check that A is not zero.
    component isZero = IsZero();
    isZero.in <== dbl3.x;
    isZero.out === 0;

    component mulAny = EscalarMulAny(256);
    for (i=0; i<256; i++) {
        mulAny.e[i] <== point2bitsH.out[i];
    }
    mulAny.p[0] <== dbl3.xout;
    mulAny.p[1] <== dbl3.yout;


// Compute the right side: right =  R8 + right2

    component addRight = BabyAdd();
    addRight.x1 <== R8x;
    addRight.y1 <== R8y;
    addRight.x2 <== mulAny.out[0];
    addRight.y2 <== mulAny.out[1];

// Calculate left side of equation left = S*B8

    var BASE8[2] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];
    component mulFix = EscalarMulFix(256, BASE8);
    for (i=0; i<256; i++) {
        var row = i \ 8;
        var col = i % 8;
        mulFix.e[i] <== bitsS[row].out[col];
    }

// Do the comparation left == right
    component xEqual = IsEqual();
    component yEqual = IsEqual();
    xEqual.in[0] <== mulFix.out[0];
    xEqual.in[1] <== addRight.xout;
    yEqual.in[0] <== mulFix.out[1];
    yEqual.in[1] <== addRight.yout;

    signal output result;
    result <== xEqual.out * yEqual.out;
}
