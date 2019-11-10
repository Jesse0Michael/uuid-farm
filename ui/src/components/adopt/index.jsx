import React, { Component } from "react";
import PropTypes from "prop-types";
import TextField from "@material-ui/core/TextField";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import { withStyles } from "@material-ui/core/styles";
import { uuidFarm } from "../../containers/app";

class AdoptPanel extends Component {
  constructor(p) {
    super(p);
    const { selected, index } = p;
    this.state = {
      selected: selected,
      index: index
    };
  }

  componentDidUpdate() {
    if (this.props.selected !== this.state.selected) {
      this.setState({
        selected: this.props.selected
      });
    }
  }

  handleClick = () => {
    uuidFarm
      .adoptUUID()
      .then(r => this.setState({ uuid: r.body }))
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
          id="adopt-field"
          className={classes.field}
          value={this.state.uuid && this.state.uuid.id}
          helperText={
            this.state.uuid && `Surrendered: ${this.state.uuid.surrenderDate}`
          }
          disabled
        />
        <Button
          variant="contained"
          color="secondary"
          className={classes.button}
          onClick={this.handleClick}
        >
          Adopt
        </Button>
      </Box>
    );
  }
}

AdoptPanel.propTypes = {
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

export default withStyles(styles)(AdoptPanel);
