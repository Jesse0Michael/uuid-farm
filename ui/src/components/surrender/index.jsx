import React, { Component } from "react";
import PropTypes from "prop-types";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
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
      value: ""
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
    this.setState({ value: event.target.value });
  };

  handleClick = () => {
    uuidFarm
      .surrenderUUID(this.state.value)
      .then(r => {
        this.setState({ uuid: r.body.id });
      })
      .catch(err => console.log(err));
  };

  render() {
    const { classes } = this.props;
    return (
      <Box
        hidden={this.state.selected !== this.state.index}
        className={classes.panel}
      >
        <TextField
          id="surrender-field"
          className={classes.field}
          label="Enter UUID"
          value={this.state.value}
          onChange={this.handleChange}
        />
        <Button
          className={classes.button}
          variant="contained"
          color="secondary"
          onClick={this.handleClick}
        >
          Surrender
        </Button>
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
    top: 0,
    bottom: 0,
    left: 0,
    margin: "auto 40px",
    position: "absolute",
    height: "40px",
    width: "300px"
  },
  button: {
    top: 0,
    bottom: 0,
    right: 0,
    margin: "auto 40px",
    position: "absolute",
    height: "40px"
  },
  panel: {
    margin: "24px",
    height: "150px",
    width: "100%"
  }
};

export default withStyles(styles)(SurrenderPanel);
