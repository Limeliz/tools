<?php

$vlan = array();
$current_vlan = null;
// Example output
$POST['vlan_output'] = 'Total PORT-VLAN entries: 40
Maximum PORT-VLAN entries: 1024

Legend: [Stk=Stack-Id, S=Slot]

PORT-VLAN 1, Name DEFAULT-VLAN, Priority level0, On
 Untagged Ports: (U1/M1)   1   2  22  34 
 Untagged Ports: (U1/M2)   1   2 
 Untagged Ports: (U1/M3)   1   2   3   4 
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 2, Name Lighting_Facility, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 3, Name AV_Facility, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 4, Name Home_Facility, Priority level0, On
 Untagged Ports: None                                             
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 5, Name Control_Facility, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 6, Name Security_Facility, Priority level0, On
 Untagged Ports: None
   Tagged Ports: (U1/M1)   1 
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 7, Name VOIP_Facility, Priority level0, On
 Untagged Ports: None
   Tagged Ports: (U1/M1)   1  22  34 
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 8, Name External_Facility, Priority level0, On
 Untagged Ports: (U1/M1)  45  47 
   Tagged Ports: (U1/M1)   1   2  22  34 
 Mac-Vlan Ports: None
     Monitoring: Disabled                                         
PORT-VLAN 9, Name Guest_Facility, Priority level0, On
 Untagged Ports: None
   Tagged Ports: (U1/M1)   1   2  22  34 
   Tagged Ports: (U1/M2)   1   2 
   Tagged Ports: (U1/M3)   1   2   3   4 
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 10, Name VideoDist_Facility, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 11, Name Admin_Apartment1, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 12, Name Lighting_Apartment1, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 13, Name AV_Apartment1, Priority level0, On             
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 14, Name Home_Apartment1, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 15, Name Control_Apartment1, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 16, Name Security_Apartment1, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 17, Name VOIP_Apartment1, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None                                             
     Monitoring: Disabled
PORT-VLAN 18, Name QSC_Apartment1, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 19, Name Guest_Apartment1, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 20, Name VideoDist_Apartment1, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 21, Name Admin_Apartment2, Priority level0, On
 Untagged Ports: (U1/M1)   3   4   5   9  17  24  25  27  29  31  33  35 
 Untagged Ports: (U1/M1)  36  37  39  42  44  46  48 
   Tagged Ports: (U1/M2)   1 
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 22, Name Lighting_Apartment2, Priority level0, On       
 Untagged Ports: (U1/M1)  13 
   Tagged Ports: (U1/M1)   3 
   Tagged Ports: (U1/M2)   1   2 
   Tagged Ports: (U1/M3)   1   2   3   4 
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 23, Name AV_Apartment2, Priority level0, On
 Untagged Ports: None
   Tagged Ports: (U1/M1)   3 
   Tagged Ports: (U1/M2)   1   2 
   Tagged Ports: (U1/M3)   1   2   3   4 
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 24, Name Home_Apartment2, Priority level0, On
 Untagged Ports: (U1/M1)   6   8  10  12  14  15  16  18  20  26  28  30 
 Untagged Ports: (U1/M1)  32  38  40 
   Tagged Ports: (U1/M1)   1   2   3  22  34 
   Tagged Ports: (U1/M2)   1   2 
   Tagged Ports: (U1/M3)   1   2   3   4 
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 25, Name Control_Apartment2, Priority level0, On
 Untagged Ports: (U1/M1)   7  19  21  23  41  43                  
   Tagged Ports: (U1/M1)   1   2   3  22  34 
   Tagged Ports: (U1/M2)   1   2 
   Tagged Ports: (U1/M3)   1   2   3   4 
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 26, Name Security_Apartment2, Priority level0, On
 Untagged Ports: (U1/M1)  11 
   Tagged Ports: (U1/M1)   3 
   Tagged Ports: (U1/M2)   1   2 
   Tagged Ports: (U1/M3)   1   2   3   4 
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 27, Name VOIP_Apartment2, Priority level0, On
 Untagged Ports: None
   Tagged Ports: (U1/M1)   3 
   Tagged Ports: (U1/M2)   1   2 
   Tagged Ports: (U1/M3)   1   2   3   4 
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 28, Name QSC_Apartment2, Priority level0, On
 Untagged Ports: None
   Tagged Ports: (U1/M1)   3 
   Tagged Ports: (U1/M2)   1   2                                  
   Tagged Ports: (U1/M3)   1   2   3   4 
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 29, Name Guest_Apartment2, Priority level0, On
 Untagged Ports: None
   Tagged Ports: (U1/M1)   1   2   3  22  34 
   Tagged Ports: (U1/M2)   1   2 
   Tagged Ports: (U1/M3)   1   2   3   4 
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 30, Name VideoDist_Apartment2, Priority level0, On
 Untagged Ports: None
   Tagged Ports: (U1/M1)   3 
   Tagged Ports: (U1/M2)   1   2 
   Tagged Ports: (U1/M3)   1   2   3   4 
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 31, Name Admin_Apartment3, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 32, Name Lighting_Apartment3, Priority level0, On       
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 33, Name AV_Apartment3, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 34, Name Home_Apartment3, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 35, Name Control_Apartment3, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 36, Name Security_Apartment3, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None                                             
     Monitoring: Disabled
PORT-VLAN 37, Name VOIP_Apartment3, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 38, Name QSC_Apartment3, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 39, Name Guest_Apartment3, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled
PORT-VLAN 40, Name VideoDist_Apartment3, Priority level0, On
 Untagged Ports: None
   Tagged Ports: None
 Mac-Vlan Ports: None
     Monitoring: Disabled';

if (!empty($_POST['vlan_output'])) {
    // Split input by newlines
    $rows = explode("\n", $_POST['vlan_output']);
    
    foreach ($rows as $row) {
        // Check if the row starts with "PORT-VLAN "
        if (substr($row, 0, 10) === "PORT-VLAN ") {
            // Find position of the first comma after "PORT-VLAN "
            $commaPos = strpos($row, ",");
            if ($commaPos !== false) {
                // Extract VLAN number substring between pos 10 and comma
                $current_vlan = substr($row, 10, $commaPos - 10);
                $current_vlan = trim($current_vlan);
            }
        } 
        // Match untagged ports line
        elseif (preg_match('/\sUntagged\sPorts:\s\(U1\/M(\d+)\)\s+([\d\s]+)/', $row, $matches)) {
            $module = $matches[1];          // module number, e.g. "1"
            $ports_str = trim($matches[2]); // ports string, e.g. "3 4 5"

            // Extract all port numbers as array
            preg_match_all('/\d+/', $ports_str, $ports_matches);
            $ports = $ports_matches[0];

            foreach ($ports as $port) {
                $key = "1/" . $module . "/" . $port;
                // Initialize arrays if not set
                if (!isset($vlan[$key]['untagged'])) {
                    $vlan[$key]['untagged'] = array();
                }
                // Add current vlan to untagged array for this port
                $vlan[$key]['untagged'][] = $current_vlan;
            }
        } 
        // Match tagged ports line
        elseif (preg_match('/\sTagged\sPorts:\s\(U1\/M(\d+)\)\s+([\d\s]+)/', $row, $matches)) {
            $module = $matches[1];
            $ports_str = trim($matches[2]);

            preg_match_all('/\d+/', $ports_str, $ports_matches);
            $ports = $ports_matches[0];

            foreach ($ports as $port) {
                $key = "1/" . $module . "/" . $port;
                if (!isset($vlan[$key]['tagged'])) {
                    $vlan[$key]['tagged'] = array();
                }
                $vlan[$key]['tagged'][] = $current_vlan;
            }
        }
    }
}

// Sort array on key correctly
uksort($vlan, function($a, $b) {
    $a_parts = explode('/', $a);
    $b_parts = explode('/', $b);

    // Compare each segment as integer
    for ($i = 0; $i < max(count($a_parts), count($b_parts)); $i++) {
        $a_val = isset($a_parts[$i]) ? (int)$a_parts[$i] : 0;
        $b_val = isset($b_parts[$i]) ? (int)$b_parts[$i] : 0;

        if ($a_val < $b_val) return -1;
        if ($a_val > $b_val) return 1;
        // else continue to next segment
    }
    return 0; // equal
});
print_r($vlan);

?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ruckus 'show vlan' beautifier</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 2em;
    }
    textarea {
      width: 100%;
      height: 200px;
      font-family: monospace;
      font-size: 1em;
      margin-bottom: 1em;
    }
    button {
      font-size: 1em;
      padding: 0.5em 1em;
    }
  </style>
</head>
<body>
  <h1>Ruckus 'show vlan' beautifier</h1>
  <p>Paste 'show vlan' output in textbox</p>
  <form id="beautifyForm">
    <textarea id="vlan_output" name="vlan_output" placeholder="Paste your output here..."></textarea><br />
    <button type="submit">Beautify</button>
  </form>
</body>
</html>
