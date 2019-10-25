package credentials

import (
	"encoding/base64"
	"encoding/json"
	"os"
)

const (
	// gacCredentials is the environment variable that specifies the credentials
	gacCredentials = "GOOGLE_CREDENTIALS"

	// gacLocation is the environment variable that specifies the credential file location
	gacLocation = "GOOGLE_APPLICATION_CREDENTIALS"
)

// WriteGAC attempts to write the Google Application Credentials to the file specified in
// the GOOGLE_APPLICATION_CREDENTIALS location if that file doesn't exist and credentials
// are specified in GOOGLE_CREDENTIALS
func WriteGAC() {
	location, ok := os.LookupEnv(gacLocation)
	if !ok && !fileExists(location) {
		return
	}

	creds, ok := os.LookupEnv(gacCredentials)
	if !ok {
		return
	}

	file, err := os.Create(location)
	if err != nil {
		return
	}
	defer file.Close()

	// Write the credentials to the file if it is json encoded
	// If not assume the value is base64 encoded
	var js json.RawMessage
	if json.Unmarshal([]byte(creds), &js) == nil {
		file.WriteString(creds)
	} else {
		if str, err := base64.RawStdEncoding.DecodeString(creds); err == nil {
			file.Write(str)
		}
	}
}

// fileExists checks if a file exists and is not a directory before we
// try using it to prevent further errors.
func fileExists(filename string) bool {
	info, err := os.Stat(filename)
	if os.IsNotExist(err) {
		return false
	}
	return !info.IsDir()
}
