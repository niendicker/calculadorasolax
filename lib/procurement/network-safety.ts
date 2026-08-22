/** Network-address checks shared by URL validation and DNS resolution. */
export function isPrivateNetworkAddress(value: string): boolean {
  const host = value.toLowerCase().replace(/^\[|\]$/g, '');
  const octets = host.split('.').map(Number);
  const isIpv4 = octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  if (isIpv4) {
    return (
      octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
      (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 0 && octets[2] === 0) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 198 && octets[1] >= 18 && octets[1] <= 19) ||
      (octets[0] === 198 && octets[1] === 51 && octets[2] === 100) ||
      (octets[0] === 203 && octets[1] === 0 && octets[2] === 113) ||
      octets[0] === 255
    );
  }

  const normalizedIpv6 = host.replace(/^0:0:0:0:0:ffff:/, '::ffff:');
  if (normalizedIpv6 === '::' || normalizedIpv6 === '::1' || /^(fc|fd)[0-9a-f]{2}:/.test(normalizedIpv6) || /^fe80:/.test(normalizedIpv6)) return true;
  const mappedIpv4 = normalizedIpv6.match(/^::ffff:(?:(\d+)\.(\d+)\.(\d+)\.(\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (!mappedIpv4) return false;
  const mappedOctets = mappedIpv4[1]
    ? mappedIpv4.slice(1, 5).map(Number)
    : [parseInt(mappedIpv4[5], 16) >> 8, parseInt(mappedIpv4[5], 16) & 255, parseInt(mappedIpv4[6], 16) >> 8, parseInt(mappedIpv4[6], 16) & 255];
  return isPrivateNetworkAddress(mappedOctets.join('.'));
}
