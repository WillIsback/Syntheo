//! Platform-neutral vector path descriptions used by native overlay renderers.

use crate::layout::{LayoutPoint, LayoutRect, LayoutSize};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PathError {
    InvalidViewBox,
    InvalidBounds,
    InvalidCommand,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PathWinding {
    NonZero,
    EvenOdd,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PathFit {
    Stretch,
    AspectFit,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PathCommand {
    MoveTo(LayoutPoint),
    LineTo(LayoutPoint),
    CubicTo {
        control1: LayoutPoint,
        control2: LayoutPoint,
        to: LayoutPoint,
    },
    Close,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PathSpec {
    pub view_box: LayoutSize,
    pub winding: PathWinding,
    pub commands: Vec<PathCommand>,
}

impl PathSpec {
    pub fn new(
        view_box: LayoutSize,
        winding: PathWinding,
        commands: Vec<PathCommand>,
    ) -> Result<Self, PathError> {
        let spec = Self {
            view_box,
            winding,
            commands,
        };
        spec.validate()?;
        Ok(spec)
    }

    pub fn transform(&self, bounds: LayoutRect, fit: PathFit) -> Result<PathTransform, PathError> {
        self.validate()?;
        if !bounds.is_valid() {
            return Err(PathError::InvalidBounds);
        }

        let scale_x = bounds.width / self.view_box.width;
        let scale_y = bounds.height / self.view_box.height;
        let (scale_x, scale_y) = match fit {
            PathFit::Stretch => (scale_x, scale_y),
            PathFit::AspectFit => {
                let scale = scale_x.min(scale_y);
                (scale, scale)
            }
        };
        let drawn_width = self.view_box.width * scale_x;
        let drawn_height = self.view_box.height * scale_y;

        Ok(PathTransform {
            x: bounds.x + (bounds.width - drawn_width) / 2.0,
            y: bounds.y + (bounds.height - drawn_height) / 2.0,
            scale_x,
            scale_y,
        })
    }

    fn validate(&self) -> Result<(), PathError> {
        if !self.view_box.is_valid() || self.view_box.width <= 0.0 || self.view_box.height <= 0.0 {
            return Err(PathError::InvalidViewBox);
        }
        if self.commands.iter().all(valid_command) {
            Ok(())
        } else {
            Err(PathError::InvalidCommand)
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PathTransform {
    x: f64,
    y: f64,
    scale_x: f64,
    scale_y: f64,
}

impl PathTransform {
    /// Maps a path point into top-left-origin layout coordinates.
    pub fn point(self, point: LayoutPoint) -> LayoutPoint {
        LayoutPoint::new(
            self.x + point.x * self.scale_x,
            self.y + point.y * self.scale_y,
        )
    }
}

fn valid_command(command: &PathCommand) -> bool {
    match command {
        PathCommand::MoveTo(point) | PathCommand::LineTo(point) => valid_point(*point),
        PathCommand::CubicTo {
            control1,
            control2,
            to,
        } => valid_point(*control1) && valid_point(*control2) && valid_point(*to),
        PathCommand::Close => true,
    }
}

fn valid_point(point: LayoutPoint) -> bool {
    point.x.is_finite() && point.y.is_finite()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aspect_fit_centers_and_transforms_points() {
        let path = PathSpec::new(
            LayoutSize::new(100.0, 50.0),
            PathWinding::NonZero,
            vec![PathCommand::MoveTo(LayoutPoint::new(100.0, 50.0))],
        )
        .unwrap();
        let transform = path
            .transform(
                LayoutRect::new(10.0, 20.0, 200.0, 200.0),
                PathFit::AspectFit,
            )
            .unwrap();
        assert_eq!(
            transform.point(LayoutPoint::new(0.0, 0.0)),
            LayoutPoint::new(10.0, 70.0)
        );
        assert_eq!(
            transform.point(LayoutPoint::new(100.0, 50.0)),
            LayoutPoint::new(210.0, 170.0)
        );
    }
}
