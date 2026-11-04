package clinic.ui.components;

import javax.swing.BorderFactory;
import javax.swing.JButton;
import java.awt.Color;
import java.awt.Cursor;
import java.awt.Font;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;

/** A flat button with rounded corners. INHERITANCE: extends Swing's JButton and overrides how it is painted. */
public class RoundedButton extends JButton {
    private static final long serialVersionUID = 1L;
    private static final Color DISABLED = new Color(0xE2E8F0);

    private final Color background;
    private final Color outline;

    public RoundedButton(String text, Color background, Color foreground, Color outline) {
        super(text);
        this.background = background;
        this.outline = outline;
        setForeground(foreground);
        setFont(new Font("Segoe UI", Font.BOLD, 13));
        setContentAreaFilled(false);
        setFocusPainted(false);
        setBorderPainted(false);
        setOpaque(false);
        setRolloverEnabled(true);
        setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        setBorder(BorderFactory.createEmptyBorder(8, 16, 8, 16));
    }

    @Override
    protected void paintComponent(Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        Color fill;
        if (!isEnabled()) {
            fill = DISABLED;
        } else if (getModel().isPressed()) {
            fill = shade(background, 0.82f);
        } else if (getModel().isRollover()) {
            fill = shade(background, 0.92f);
        } else {
            fill = background;
        }
        g2.setColor(fill);
        g2.fillRoundRect(0, 0, getWidth(), getHeight(), 10, 10);
        if (outline != null) {
            g2.setColor(outline);
            g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 10, 10);
        }
        g2.dispose();
        super.paintComponent(g);
    }

    private static Color shade(Color color, float factor) {
        return new Color(Math.round(color.getRed() * factor), Math.round(color.getGreen() * factor),
                Math.round(color.getBlue() * factor));
    }
}
