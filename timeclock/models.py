from django.db import models

class TimeEntry(models.Model):
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.date}: {self.start_time} - {self.end_time}"