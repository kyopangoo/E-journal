import fs from 'fs';
const js = fs.readFileSync('/opt/e-forum/client/dist/assets/index-Cp8ToERg.js', 'utf8');
console.log('buildTree in bundle:', js.includes('buildTree'));
console.log('children.filter in bundle:', js.includes('replies.filter'));
console.log('tweet-thread__children in bundle:', js.includes('tweet-thread__children'));
