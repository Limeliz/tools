# Default for most cameras
Snapshot: `http://<user>:<pass>@<ip>:<port>/<device_specific_url>?<param1>=<setting1>&<param2>=<setting2>`

MJPEG: `http://<user>:<pass>@<ip>:<port>/<device_specific_url>?<param1>=<setting1>&<param2>=<setting2>`

RTSP: `rtsp://<user>:<pass>@<ip>:<port>/<device_specific_url>?<param1>=<setting1>&<param2>=<setting2>`

| Protocol | Port |
| --- | --- |
| Snapshot | 80/443 |
| MJPEG | 80/443 |
| RTSP | 554 |

# Axis
| Default username | Default password |
| --- | --- |
| root | *configured on first login* |

## Axis snapshot (still image)
`http://<user>:<pass>@<ip>:<port>/axis-cgi/jpg/image.cgi`

| Optional parameters | Description |
| --- | --- |
| camera=3 | Optional parameter, used to select a specific camera channel (if applicable, e.g. encoders or cameras with multiple view areas) |
| resolution=1280x720 | Optional parameter specifies the desired resolution. (ratio must match camera) |
| videocodec=h264 | Optional parameter to specify the video codec. In this case, it's set to H.264 |
| compression=25 | Optional parameter to specify image compression. In this case, it's set to 25% |
| rotation=180 | Optional parameter to specify image rotation (0, 90, 180, 270). |


## Axis MJPEG (motion jpeg)
`http://<user>:<pass>@<ip>:<port>/axis-cgi/mjpg/video.cgi`

| Optional parameters | Description |
| --- | --- |
| camera=3 | Optional parameter, used to select a specific camera channel (if applicable, e.g. encoders or cameras with multiple view areas) |
| resolution=1280x720 | Optional parameter specifies the desired resolution. (ratio must match camera) |
| videocodec=h264 | Optional parameter to specify the video codec. In this case, it's set to H.264 |
| compression=25 | Optional parameter to specify image compression. In this case, it's set to 25% |
| rotation=180 | Optional parameter to specify image rotation (0, 90, 180, 270). |

## Axis RTSP (video stream)
`rtsp://<user>:<pass>@<ip>:<port>/axis-media/media.amp`

| Optional parameters | Description |
| --- | --- |
| camera=3 | Optional parameter, used to select a specific camera channel (if applicable, e.g. encoders or cameras with multiple view areas) |
| resolution=1280x720 | Optional parameter specifies the desired resolution. (ratio must match camera) |
| videocodec=h264 | Optional parameter to specify the video codec. In this case, it's set to H.264 |



# Novus
| Default username | Default password |
| --- | --- |
| root | *configured on first login? 1234? pass?* |

## Novus snapshot (still image)
`http://<user>:<pass>@<ip>:<port>/GetSnapshot/1`

| Optional parameters | Description |
| --- | --- |
| /1 | Required parameter, used to select a specific camera channel (if applicable, e.g. encoders or cameras with multiple view areas) |

## Novus RTSP (video stream)
`rtsp://<user>:<pass>@<ip>:<port>/profile1`

| Optional parameters | Description |
| --- | --- |
| /profile1 | Streaming profile 1 (full) |
| /profile2 | Streaming profile 2 (medium) |
| /profile3 | Streaming profile 2 (low) |
