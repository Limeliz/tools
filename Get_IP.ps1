# Lists IP-adress, name and DHCP/static of selected local interfaces.

# Define interface indexes. To see your interface indexes, run
# "Get-NetIPAddress -AddressFamily IPv4" and look for InterfaceIndex
$ifIndexes = @(10, 55, 75, 63, 11, 94, 18, 35)

# Filter IP addresses based on those indexes
Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceIndex -in $ifIndexes } |
    Select-Object IPAddress, InterfaceAlias, PrefixOrigin
