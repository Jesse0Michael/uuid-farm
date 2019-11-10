import React, { Component } from "react";
import PropTypes from "prop-types";
import TextField from "@material-ui/core/TextField";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import { withStyles } from "@material-ui/core/styles";
import { uuidFarm, timeSince } from "../../containers/app";

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
    this.setState({ uuid: null, error: null });

    uuidFarm
      .adoptUUID()
      .then(r => {
        if (r.response.statusCode === 404) {
          this.setState({ error: "No UUIDs available" });
        } else if (r.response.statusCode >= 400) {
          this.setState({ error: "Unexpected error occurred" });
        } else {
          this.setState({ uuid: r.body });
        }
      })
      .catch(err => {
        this.setState({ error: "Unexpected error occurred" });
        console.log(err);
      });
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
            (this.state.uuid &&
              `Surrendered ${timeSince(
                new Date(this.state.uuid.surrenderDate)
              )} ago`) ||
            this.state.error
          }
          error={this.state.error}
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
    width: "300px",
    "& *": {
      color: "rgba(0, 0, 0, 0.87)"
    }
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
