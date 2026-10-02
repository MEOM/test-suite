<?php
// Generates a 2400x1600 JPEG for the test bed and prints its path inside the
// container. The About page shows it at 300px, so the image audit has a real
// oversized image to report. Run with wp eval-file.
$path  = '/tmp/launch-check-large.jpg';
$image = imagecreatetruecolor( 2400, 1600 );
for ( $y = 0; $y < 1600; $y += 40 ) {
	for ( $x = 0; $x < 2400; $x += 40 ) {
		$colour = imagecolorallocate( $image, ( $x * 7 + $y ) % 256, ( $y * 5 ) % 256, ( $x + $y * 3 ) % 256 );
		imagefilledrectangle( $image, $x, $y, $x + 39, $y + 39, $colour );
	}
}
imagejpeg( $image, $path, 90 );
imagedestroy( $image );
echo $path;
