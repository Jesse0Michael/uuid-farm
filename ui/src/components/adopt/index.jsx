import React, { Component } from "react";
import PropTypes from "prop-types";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import TextField from "@material-ui/core/TextField";
import { withStyles } from "@material-ui/core/styles";
import { uuidFarm, timeSince } from "../../containers/app";

class AdoptPanel extends Component {
  constructor(p) {
    super(p);
    const { selected, index } = p;
    this.state = {
      selected: selected,
      index: index,
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

  handleClick = () => {
    if (!this.state.loading) {
      this.setState({ uuid: null, error: null, loading: true });

      uuidFarm
        .adoptUUID()
        .then(r => {
          this.setState({ uuid: r.body });
        })
        .catch(err => {
          if (err.statusCode === 404) {
            this.setState({ error: "No UUIDs available" });
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
            disabled={this.state.loading}
          >
            {this.state.loading && <CircularProgress size={24} />}
            {!this.state.loading && "Adopt"}
          </Button>
        </Box>
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
    margin: "auto 12px",
    height: "40px",
    width: "300px",
    "& *": {
      color: "rgba(0, 0, 0, 0.87)"
    }
  },
  button: {
    margin: "auto 12px",
    height: "40px",
    width: "80px"
  },
  panel: {
    height: "150px",
    width: "100%",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-evenly"
  }
};

export default withStyles(styles)(AdoptPanel);
