const fs = require('fs');
const content = fs.readFileSync('SalesTreasuryPage.tsx', 'utf8');
const lines = content.split('\n');
let stack = [];
lines.forEach((line, i) => {
    const tokens = line.match(/<div|<\/div/g);
    if (tokens) {
        tokens.forEach(t => {
            if (t === '<div') {
                stack.push(i + 1);
            } else {
                if (stack.length === 0) {
                    console.log(`Unmatched closing div at line ${i + 1}`);
                } else {
                    stack.pop();
                }
            }
        });
    }
});
console.log('Unclosed divs opened at lines:', stack);
