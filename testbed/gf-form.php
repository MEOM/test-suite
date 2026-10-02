<?php
// Creates the test bed contact form and prints its id. Run with wp eval-file.
$form_id = GFAPI::add_form(
	[
		'title'  => 'Launch check contact',
		'button' => [ 'type' => 'text', 'text' => 'Send' ],
		'fields' => [
			[ 'type' => 'text', 'id' => 1, 'label' => 'Name', 'isRequired' => true ],
			[ 'type' => 'email', 'id' => 2, 'label' => 'Email', 'isRequired' => true ],
			[ 'type' => 'phone', 'id' => 3, 'label' => 'Phone', 'phoneFormat' => 'international' ],
			[ 'type' => 'textarea', 'id' => 4, 'label' => 'Message' ],
			[
				'type'       => 'checkbox',
				'id'         => 5,
				'label'      => 'Consent',
				'isRequired' => true,
				'choices'    => [ [ 'text' => 'I agree to the privacy policy', 'value' => 'agree' ] ],
				'inputs'     => [ [ 'id' => '5.1', 'label' => 'I agree to the privacy policy' ] ],
			],
		],
	]
);
if ( is_wp_error( $form_id ) ) {
	WP_CLI::error( $form_id->get_error_message() );
}
echo $form_id;
