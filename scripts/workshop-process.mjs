// Windows batch wrappers require cmd.exe. Quote every argument and reject its
// expansion/control characters; never pass catalog text to a shell command.
export function processSpecification(command, args, platform = process.platform) {
  if (platform !== 'win32') return {command,args};
  const values = [command,...args];
  if (values.some(value => /["&|<>^%!\r\n]/.test(value))) {
    throw new Error('Use a Windows project path without shell control characters for this local proof.');
  }
  return {command:'cmd.exe',args:['/d','/s','/c',`"${values.map(value => `"${value}"`).join(' ')}"`]};
}
