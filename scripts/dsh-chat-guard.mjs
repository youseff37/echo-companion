// This plugin is mounted inside the dedicated agent preset, where DSH has a scope.
export const name = 'dafeiyu-chat-tool-guard';
export const inject = ['tools'];
export function apply(ctx) {
  // Includes QQ's globally registered send-file tool and working_directory.
  // Scope-local tools remain visible in DSH; this preset mounts no such tools.
  ctx.tools.restrict({allow:[]});
}
