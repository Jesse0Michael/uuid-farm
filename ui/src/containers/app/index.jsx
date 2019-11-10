import React from "react";
import { MuiThemeProvider, createMuiTheme } from "@material-ui/core/styles";
import grey from "@material-ui/core/colors/grey";
import orange from "@material-ui/core/colors/orange";
import red from "@material-ui/core/colors/red";
import * as uuid from "@jesse0michael/uuid-farm";
import Registrar from "../../components/registrar";

export const uuidFarm = new uuid.DefaultApi();

// All the following keys are optional.
// We try our best to provide a great default value.
const theme = createMuiTheme({
  palette: {
    primary: grey,
    secondary: orange,
    error: red,
    // Used by `getContrastText()` to maximize the contrast between the background and
    // the text.
    contrastThreshold: 3,
    // Used to shift a color's luminance by approximately
    // two indexes within its tonal palette.
    // E.g., shift from Red 500 to Red 300 or Red 700.
    tonalOffset: 0.2
  }
});

function App() {
  return (
    <div className="app">
      <MuiThemeProvider theme={theme}>
        <Registrar />
      </MuiThemeProvider>
    </div>
  );
}

export default App;
