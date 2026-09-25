const replies = [
  {id: 1, parentReplyId: null, body: "First"},
  {id: 2, parentReplyId: 1, body: "Reply to first"},
  {id: 3, parentReplyId: 2, body: "Reply to reply"}
];

function buildTree(replies) {
  function flatten(replies, result = []) {
    for (const reply of replies) {
      result.push(reply);
      if (reply.replies?.length) {
        flatten(reply.replies, result);
      }
    }
    return result;
  }

  const normalized = flatten(replies).map((r) => ({ ...r, parentId: r.parentReplyId }));
  const nodes = new Map(normalized.map((reply) => [reply.id, { ...reply, children: [] }]));
  const roots = [];

  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

console.log(JSON.stringify(buildTree(replies), null, 2));
