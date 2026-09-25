const replies = [
  {id: 33, parentReplyId: null, authorName: "bayu", authorUsername: "bayu", authorRole: "admin"},
  {id: 35, parentReplyId: 33, authorName: "ogi", authorUsername: "ogi", authorRole: "staff"}
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

  const normalized = flatten(replies).map((r) => ({ ...r, parentId: r.parent_id }));
  console.log("Normalized:", JSON.stringify(normalized, null, 2));
  
  const nodes = new Map(normalized.map((reply) => [reply.id, { ...reply, children: [] }]));
  const roots = [];

  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

const tree = buildTree(replies);
console.log("Tree:", JSON.stringify(tree, null, 2));
