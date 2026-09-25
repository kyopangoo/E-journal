import fs from 'fs';
const js = fs.readFileSync('/opt/e-forum/client/dist/assets/index-Cp8ToERg.js', 'utf8');
console.log('children.filter in bundle:', js.includes('replies.filter'));
console.log('parentReplyId in bundle:', js.includes('parentReplyId'));
console.log('RenderNode in bundle:', js.includes('renderNode'));
