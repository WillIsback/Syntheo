export function markdownToText(content: string): string {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function markdownToOrg(content: string): string {
  return content
    .replace(/^(#{1,6})\s+/gm, (_match, hashes: string) => {
      return `${"*".repeat(hashes.length)} `;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[[$2][$1]]")
    .replace(/\*\*(.*?)\*\*/g, "*$1*")
    .replace(/__(.*?)__/g, "*$1*")
    .replace(/`([^`]+)`/g, "~$1~")
    .trim();
}
