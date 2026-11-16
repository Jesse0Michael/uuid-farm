package api

type ApiError struct {
	Code int32 `json:"code"`

	Message string `json:"message"`
}
