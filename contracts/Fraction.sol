pragma solidity ^0.4.15;

library Fraction {

    function shareOf(uint[2] fraction, uint total) returns (uint) {
        return (total * fraction[0]) / fraction[1];
    }

    // function compareTo(uint[2] a, uint[2] b) returns (int) {
    //     uint sizeA = a[0]*b[1];
    //     uint sizeB = b[0]*a[1];
    //     if (sizeA > sizeB) {
    //         return 1;
    //     }
    //     if (sizeA < sizeB) {
    //         return -1;
    //     }
    //     return 0;
    // }

    // function min(uint[2] a, uint[2] b) returns (uint[2]) {
    //     if (compareTo(a, b) < 0) {
    //         return a;
    //     }

    //     return b;
    // }

    // function valid(uint[2] a) returns (bool) {
    //     return a[0] < a[1] && a[1] > 0;
    // }

    // function nonZero(uint[2] a) returns (bool) {
    //     return a[0] > 0;
    // }

    // function divide(uint[2] fraction, uint divisor) returns (uint[2]) {
    //     assert(divisor > 0);
    //     return [fraction[0], fraction[1] * divisor];
    // }

    // function multiply(uint[2] fraction, uint num) returns (uint[2]) {
    //     return [fraction[0] * num, fraction[1]];
    // }
}