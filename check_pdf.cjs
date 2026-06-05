const fs = require('fs');
const text = fs.readFileSync('F:/IPro/test_output.pdf', 'latin1');
const m = (text.match(/\/Type \/Page(?!s)/g) || []).length;
console.log('Page count:', m);
