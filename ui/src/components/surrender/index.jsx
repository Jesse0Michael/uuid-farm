import React, { Component } from "react";
import PropTypes from "prop-types";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import TextField from "@material-ui/core/TextField";
import { withStyles } from "@material-ui/core/styles";
import { uuidFarm } from "../../containers/app";

class SurrenderPanel extends Component {
  constructor(p) {
    super(p);
    const { selected, index } = p;
    this.state = {
      selected: selected,
      index: index,
      value: "",
      error: ""
    };
  }

  componentDidUpdate() {
    if (this.props.selected !== this.state.selected) {
      this.setState({
        selected: this.props.selected
      });
    }
  }

  handleChange = event => {
    this.setState({ value: event.target.value, uuid: null, error: null });
  };

  handleClick = () => {
    if (!this.state.loading) {
      this.setState({ uuid: null, error: null, loading: true });

      uuidFarm
        .surrenderUUID(this.state.value)
        .then(r => {
          this.setState({ uuid: r.body });
        })
        .catch(err => {
          if (err.statusCode === 400) {
            this.setState({ error: "Invalid UUID" });
          } else if (err.statusCode === 409) {
            this.setState({ error: "UUID already exists" });
          } else {
            this.setState({ error: "Unexpected error occurred" });
          }
        })
        .then(() => this.setState({ loading: false }));
    }
  };

  render() {
    const { classes } = this.props;
    return (
      <Box hidden={this.state.selected !== this.state.index}>
        <Box className={classes.panel}>
          <TextField
            id="surrender-field"
            className={classes.field}
            label="Enter UUID"
            value={this.state.value}
            helperText={
              (this.state.uuid && "UUID accepted") || this.state.error
            }
            error={this.state.error}
            onChange={this.handleChange}
          />
          <Button
            className={classes.button}
            variant="contained"
            color="secondary"
            onClick={this.handleClick}
            disabled={this.state.loading}
          >
            {this.state.loading && <CircularProgress size={24} />}
            {!this.state.loading && "Surrender"}
          </Button>
        </Box>
      </Box>
    );
  }
}

SurrenderPanel.propTypes = {
  index: PropTypes.any.isRequired,
  selected: PropTypes.any.isRequired
};

const styles = {
  field: {
    margin: "auto 12px",
    height: "40px",
    width: "300px",
    "& .MuiFormHelperText-root.Mui-error": {
      color: "rgba(200, 0, 0, 0.87)"
    },
    "& .MuiFormHelperText-root": {
      color: "rgba(0, 200, 0, 0.87)"
    }
  },
  button: {
    margin: "auto 12px",
    height: "40px",
    width: "120px"
  },
  panel: {
    height: "150px",
    width: "100%",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-evenly"
  }
};

export default withStyles(styles)(SurrenderPanel);
