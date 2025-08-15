<?php

$vlan = array();
$vlan_names = array();
$current_vlan = null;

if (!empty($_POST['vlan_output'])) {
    // Split input by newlines
    $rows = explode("\n", $_POST['vlan_output']);
    
    foreach ($rows as $row) {
        // Matches rows starting with "PORT-VLAN " and the VLAN name
		if (preg_match('/PORT-VLAN\s(\d+),\sName\s([A-Za-z0-9\-_\[\]]+),/', $row, $matches)) {
			$current_vlan = $matches[1];
			$vlan_name[$matches[1]] = $matches[2];

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
	table {
		width: 100%;
	}
	table, th, td {
		border-collapse: collapse;
		border: 1px solid;
	}
	th {
		vertical-align: top;
	}
	td {
		text-align: center;
	}
	/* Highlight the hovered cell */
	td:hover {
		background-color: #fffa9e;
	}
	/* Highlight the entire row */
	tr:hover td {
		background-color: #e1edf7;
	}
	/* first two rows (headers) */
	tr:nth-child(1),tr:nth-child(2) {
		background-color: #f0f8ff;
	}
	/* Untagged-column */
	td:nth-child(2) {
		background-color: #e3ffe0;
	}
	/* vlan 11-20 */
	td:nth-child(13),td:nth-child(14),td:nth-child(15),td:nth-child(16),td:nth-child(17),td:nth-child(18),td:nth-child(19),td:nth-child(20),td:nth-child(21),td:nth-child(22) {
		background-color: #e3ffe0;
	}	
	/* vlan 31-40 */
	td:nth-child(33),td:nth-child(34),td:nth-child(35),td:nth-child(36),td:nth-child(37),td:nth-child(38),td:nth-child(39),td:nth-child(40),td:nth-child(41),td:nth-child(42) {
		background-color: #e3ffe0;
	}
  </style>
</head>
<body>
  <h1>Ruckus 'show vlan' beautifier</h1>
  <p>Paste 'show vlan' output in textbox</p>
  <form id="beautifyForm" method="POST">
    <textarea id="vlan_output" name="vlan_output" placeholder="Paste your output here..."><?=@$_POST['vlan_output']?></textarea><br />
    <button type="submit">Beautify</button>
  </form>
  <pre>
  <?php
//  print_r($vlan); // debugging
  print "    <table>\n      <tr><th rowspan='2'>Port</th><th rowspan='2'>Untagged</th><th colspan='40'>Tagged</th></tr>\n";
  print "      <tr>\n";
 
  for ($i = 1; $i <= 40; $i++) {
	  print "        <th title='".@$vlan_name[$i]."'>$i</th>\n";
  }
  print "      </tr>\n";
  
  foreach ($vlan as $port => $data) {
	  print "      <tr>\n        <td>$port</td>\n        <td>" . @implode(", ", $data['untagged']) . "</td>\n";
	  for ($i = 1; $i <= 40; $i++) {
		  if ($i%10==1) {
			  print "        ";	// tabbing for new row each 10 vlan
		  }
		  $p = @in_array($i, $data['tagged'])?$i:"";	// only print port if its tagged
		  print "<td>$p</td>";
		  if ($i%10==0) {
			  print "\n";	// new row each 10 vlan
		  }
	  }
  }
	?>
</body>
</html>
