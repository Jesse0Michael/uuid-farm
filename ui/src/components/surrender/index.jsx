import React, { Component } from "react";
import PropTypes from "prop-types";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import { uuidFarm } from "../../containers/app";
import "./surrender.css";

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
    return (
      <Box
        p={3}
        component="div"
        role="tabpanel"
        hidden={this.state.selected !== this.state.index}
        id={`surrender-tabpanel-${this.state.index}`}
      >
        <TextField
          id="surrender-field"
          className="surrender-field"
          label="Enter UUID"
          margin="normal"
          value={this.state.value}
          onChange={this.handleChange}
        />
        <Button
          variant="contained"
          color="secondary"
          className="surrender-button"
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

export default SurrenderPanel;
