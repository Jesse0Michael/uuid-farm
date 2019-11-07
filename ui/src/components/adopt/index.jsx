import React, { Component } from "react";
import PropTypes from "prop-types";
import Typography from "@material-ui/core/Typography";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import { uuidFarm } from "../../containers/app";
import "./adopt.css";

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
      .then(r => this.setState({ uuid: r.body.id }))
      .catch(err => console.log(err));
  };

  render() {
    return (
      <Box
        p={3}
        component="div"
        role="tabpanel"
        hidden={this.state.selected !== this.state.index}
        id={`adopt-tabpanel-${this.state.index}`}
      >
        <Typography variant="h4" hidden={this.state.uuid == null}>
          {this.state.uuid}
        </Typography>
        <Button
          variant="contained"
          color="secondary"
          className="adopt-button"
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

export default AdoptPanel;
